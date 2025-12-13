# Microsoft Teams Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/teams`

---

## 1. Client Initialization

### 1.1 TeamsClient Factory

```pseudocode
FUNCTION TeamsClient.new(config: TeamsConfig) -> Result<TeamsClient>:
    // Validate configuration
    validate_config(config)?

    // Get credential from shared azure/auth
    credential = AzureCredential.from_default_chain()

    // Initialize HTTP transport with shared resilience
    transport = HttpTransport.new({
        timeout: config.timeout,
        retry_policy: RetryPolicy.from_shared_resilience(),
        circuit_breaker: CircuitBreaker.per_service()
    })

    // Initialize services lazily
    RETURN TeamsClient {
        config: config,
        credential: credential,
        transport: transport,
        webhook_service: OnceCell.empty(),
        bot_service: OnceCell.empty(),
        graph_service: OnceCell.empty(),
        router: OnceCell.empty()
    }

FUNCTION TeamsClient.from_env() -> Result<TeamsClient>:
    config = TeamsConfig {
        tenant_id: env("AZURE_TENANT_ID")?,
        bot_id: env_optional("TEAMS_BOT_ID"),
        bot_secret: env_optional("TEAMS_BOT_SECRET").map(SecretString::new),
        default_webhook_url: env_optional("TEAMS_WEBHOOK_URL").map(SecretString::new),
        service_url: env_optional("TEAMS_SERVICE_URL"),
        graph_base_url: env_or("GRAPH_BASE_URL", "https://graph.microsoft.com/v1.0"),
        timeout: Duration::from_secs(30),
        max_retries: 3
    }
    RETURN TeamsClient.new(config)

FUNCTION validate_config(config: TeamsConfig) -> Result<()>:
    IF config.tenant_id.is_empty():
        RETURN Err(InvalidConfiguration("tenant_id is required"))

    // Must have either webhook or bot configured
    IF config.default_webhook_url.is_none() AND config.bot_id.is_none():
        RETURN Err(InvalidConfiguration("Either webhook URL or bot ID must be configured"))

    IF config.bot_id.is_some() AND config.bot_secret.is_none():
        RETURN Err(InvalidConfiguration("bot_secret required when bot_id is set"))

    RETURN Ok(())
```

### 1.2 Authentication

```pseudocode
FUNCTION get_graph_token(credential, tenant_id) -> Result<AccessToken>:
    scope = "https://graph.microsoft.com/.default"
    RETURN credential.get_token(scope, tenant_id)

FUNCTION get_bot_token(bot_id, bot_secret, tenant_id) -> Result<AccessToken>:
    // Bot Framework uses client credentials flow
    token_url = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

    body = {
        grant_type: "client_credentials",
        client_id: bot_id,
        client_secret: bot_secret.expose_secret(),
        scope: "https://api.botframework.com/.default"
    }

    response = http_post(token_url, body)

    IF response.status == 200:
        token_data = parse_json(response.body)
        RETURN Ok(AccessToken {
            value: token_data.access_token,
            expires_at: now() + Duration::from_secs(token_data.expires_in)
        })
    ELSE:
        RETURN Err(AuthenticationFailed { message: response.body })
```

---

## 2. WebhookService Implementation

### 2.1 Send Message via Webhook

```pseudocode
FUNCTION WebhookService.send_message(webhook_url, message) -> Result<WebhookResponse>:
    // Build payload for simple text message
    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "text": message
    }

    RETURN send_webhook_payload(webhook_url, payload)

FUNCTION WebhookService.send_formatted_message(webhook_url, message) -> Result<WebhookResponse>:
    // Build MessageCard payload
    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": message.theme_color OR "0076D7",
        "title": message.title,
        "summary": message.summary OR message.title,
        "sections": []
    }

    FOR section IN message.sections:
        section_payload = {
            "activityTitle": section.title,
            "activitySubtitle": section.subtitle,
            "activityImage": section.image_url,
            "facts": section.facts.map(|f| { "name": f.name, "value": f.value }),
            "text": section.text,
            "markdown": section.markdown OR true
        }
        payload.sections.append(section_payload)

    IF message.actions.is_not_empty():
        payload.potentialAction = message.actions.map(build_action)

    RETURN send_webhook_payload(webhook_url, payload)

FUNCTION WebhookService.send_card(webhook_url, card) -> Result<WebhookResponse>:
    // Validate card schema
    validate_adaptive_card(card)?

    // Wrap adaptive card in attachment
    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "contentUrl": null,
            "content": card.to_json()
        }]
    }

    RETURN send_webhook_payload(webhook_url, payload)

FUNCTION send_webhook_payload(webhook_url, payload) -> Result<WebhookResponse>:
    WITH span("teams.send_webhook", {has_card: payload.attachments.is_some()}):
        start_time = now()

        // Never log the webhook URL
        log_debug("Sending webhook message", {payload_type: payload["@type"] OR "adaptive"})

        response = transport.post(
            url: webhook_url.expose_secret(),
            body: payload,
            headers: {"Content-Type": "application/json"}
        )

        duration = now() - start_time
        emit_metric("teams_webhook_requests_total", {status: response.status})
        emit_metric("teams_message_duration_ms", duration, {method: "webhook"})

        IF response.status == 200:
            RETURN Ok(WebhookResponse { success: true, message_id: None })
        ELSE IF response.status == 429:
            retry_after = parse_retry_after(response.headers)
            RETURN Err(RateLimited { retry_after_ms: retry_after })
        ELSE:
            RETURN Err(WebhookFailed { status: response.status })

FUNCTION WebhookService.send_to_default(message) -> Result<WebhookResponse>:
    webhook_url = config.default_webhook_url
        .ok_or(TeamsError::InvalidWebhookUrl)?

    payload = message.into()
    RETURN send_webhook_payload(webhook_url, payload)
```

---

## 3. BotService Implementation

### 3.1 Send Proactive Message

```pseudocode
FUNCTION BotService.send_proactive_message(conversation, activity) -> Result<ResourceResponse>:
    // Ensure bot is configured
    IF config.bot_id.is_none():
        RETURN Err(BotNotConfigured)

    // Get bot token
    token = get_bot_token(config.bot_id, config.bot_secret, config.tenant_id)?

    // Build activity with required fields
    full_activity = Activity {
        activity_type: activity.activity_type OR ActivityType::Message,
        service_url: conversation.service_url,
        channel_id: conversation.channel_id,
        conversation: conversation.conversation,
        from: conversation.bot,
        recipient: conversation.user,
        text: activity.text,
        attachments: activity.attachments,
        ...activity
    }

    url = "{service_url}/v3/conversations/{conversation_id}/activities"
        .replace("{service_url}", conversation.service_url)
        .replace("{conversation_id}", conversation.conversation.id)

    WITH span("teams.send_bot_message", {
        conversation_id: conversation.conversation.id,
        activity_type: full_activity.activity_type
    }):
        response = transport.post(
            url: url,
            body: full_activity.to_json(),
            headers: {
                "Authorization": "Bearer " + token.value,
                "Content-Type": "application/json"
            }
        )

        emit_metric("teams_bot_activities_total", {
            activity_type: "message",
            direction: "outbound"
        })

        IF response.status == 200 OR response.status == 201:
            result = parse_json(response.body)
            RETURN Ok(ResourceResponse { id: result.id })
        ELSE:
            RETURN Err(map_bot_error(response))

FUNCTION BotService.reply_to_activity(conversation_id, activity_id, reply) -> Result<ResourceResponse>:
    token = get_bot_token(config.bot_id, config.bot_secret, config.tenant_id)?

    reply.reply_to_id = activity_id

    url = "{service_url}/v3/conversations/{conversation_id}/activities/{activity_id}"
        .replace("{conversation_id}", conversation_id)
        .replace("{activity_id}", activity_id)

    WITH span("teams.reply_to_activity", {conversation_id, activity_id}):
        response = transport.post(url, reply.to_json(), auth_headers(token))

        IF response.status == 200 OR response.status == 201:
            result = parse_json(response.body)
            RETURN Ok(ResourceResponse { id: result.id })
        ELSE:
            RETURN Err(map_bot_error(response))
```

### 3.2 Conversation Management

```pseudocode
FUNCTION BotService.create_conversation(params) -> Result<ConversationReference>:
    token = get_bot_token(config.bot_id, config.bot_secret, config.tenant_id)?

    body = {
        "bot": {
            "id": config.bot_id,
            "name": params.bot_name OR "Bot"
        },
        "isGroup": params.is_group OR false,
        "tenantId": config.tenant_id,
        "activity": params.initial_activity
    }

    IF params.members.is_not_empty():
        body.members = params.members.map(|m| {
            "id": m.id,
            "name": m.name
        })

    IF params.channel_data.is_some():
        body.channelData = params.channel_data

    url = "{service_url}/v3/conversations"

    WITH span("teams.create_conversation", {is_group: params.is_group}):
        response = transport.post(url, body, auth_headers(token))

        IF response.status == 200 OR response.status == 201:
            result = parse_json(response.body)
            RETURN Ok(ConversationReference {
                activity_id: result.activityId,
                bot: body.bot,
                channel_id: "msteams",
                conversation: ConversationAccount {
                    id: result.id,
                    tenant_id: config.tenant_id
                },
                service_url: config.service_url
            })
        ELSE:
            RETURN Err(ConversationCreationFailed { message: response.body })

FUNCTION BotService.get_conversation_members(conversation_id) -> Result<Vec<ChannelAccount>>:
    token = get_bot_token(config.bot_id, config.bot_secret, config.tenant_id)?

    url = "{service_url}/v3/conversations/{conversation_id}/members"

    WITH span("teams.get_members", {conversation_id}):
        response = transport.get(url, auth_headers(token))

        IF response.status == 200:
            members = parse_json(response.body)
            RETURN Ok(members.map(parse_channel_account))
        ELSE:
            RETURN Err(map_bot_error(response))
```

### 3.3 Activity Processing

```pseudocode
FUNCTION BotService.process_activity(activity, handler) -> Result<()>:
    WITH span("teams.process_activity", {
        activity_type: activity.activity_type,
        from_id: activity.from.id
    }):
        emit_metric("teams_bot_activities_total", {
            activity_type: activity.activity_type.to_string(),
            direction: "inbound"
        })

        // Create turn context
        turn_context = TurnContext {
            activity: activity,
            client: self,
            responded: false
        }

        MATCH activity.activity_type:
            ActivityType::Message =>
                handler.on_message(turn_context).await?

            ActivityType::ConversationUpdate =>
                IF activity.members_added.is_not_empty():
                    handler.on_members_added(turn_context, activity.members_added).await?
                IF activity.members_removed.is_not_empty():
                    handler.on_members_removed(turn_context, activity.members_removed).await?

            ActivityType::MessageReaction =>
                IF activity.reactions_added.is_not_empty():
                    handler.on_reactions_added(turn_context, activity.reactions_added).await?
                IF activity.reactions_removed.is_not_empty():
                    handler.on_reactions_removed(turn_context, activity.reactions_removed).await?

            ActivityType::Invoke =>
                result = handler.on_invoke(turn_context).await?
                // Send invoke response
                RETURN send_invoke_response(activity, result)

            _ =>
                handler.on_unrecognized_activity(turn_context).await?

        RETURN Ok(())
```

---

## 4. GraphService Implementation

### 4.1 Team and Channel Operations

```pseudocode
FUNCTION GraphService.list_joined_teams() -> Result<Vec<Team>>:
    token = get_graph_token(credential, config.tenant_id)?

    teams = []
    next_link = NULL

    WITH span("teams.graph_request", {operation: "list_joined_teams"}):
        LOOP:
            url = next_link OR "{graph_base_url}/me/joinedTeams"

            response = transport.get(url, {
                "Authorization": "Bearer " + token.value
            })

            IF response.status == 200:
                page = parse_json(response.body)

                FOR item IN page.value:
                    teams.append(Team {
                        id: item.id,
                        display_name: item.displayName,
                        description: item.description,
                        visibility: parse_visibility(item.visibility)
                    })

                next_link = page["@odata.nextLink"]
                IF next_link IS NULL:
                    BREAK
            ELSE:
                RETURN Err(map_graph_error(response))

        emit_metric("teams_graph_requests_total", {operation: "list_joined_teams", status: "success"})
        RETURN Ok(teams)

FUNCTION GraphService.list_channels(team_id) -> Result<Vec<Channel>>:
    token = get_graph_token(credential, config.tenant_id)?

    url = "{graph_base_url}/teams/{team_id}/channels"

    WITH span("teams.graph_request", {operation: "list_channels", team_id}):
        response = transport.get(url, auth_headers(token))

        IF response.status == 200:
            data = parse_json(response.body)
            channels = data.value.map(|item| Channel {
                id: item.id,
                display_name: item.displayName,
                description: item.description,
                membership_type: parse_membership_type(item.membershipType)
            })
            RETURN Ok(channels)
        ELSE IF response.status == 404:
            RETURN Err(TeamNotFound { team_id })
        ELSE:
            RETURN Err(map_graph_error(response))

FUNCTION GraphService.get_channel(team_id, channel_id) -> Result<Channel>:
    token = get_graph_token(credential, config.tenant_id)?

    url = "{graph_base_url}/teams/{team_id}/channels/{channel_id}"

    WITH span("teams.graph_request", {operation: "get_channel", team_id, channel_id}):
        response = transport.get(url, auth_headers(token))

        IF response.status == 200:
            item = parse_json(response.body)
            RETURN Ok(Channel {
                id: item.id,
                display_name: item.displayName,
                description: item.description,
                membership_type: parse_membership_type(item.membershipType)
            })
        ELSE IF response.status == 404:
            RETURN Err(ChannelNotFound { channel_id })
        ELSE:
            RETURN Err(map_graph_error(response))
```

### 4.2 Chat Operations

```pseudocode
FUNCTION GraphService.list_chats() -> Result<Vec<Chat>>:
    token = get_graph_token(credential, config.tenant_id)?

    chats = []
    next_link = NULL

    WITH span("teams.graph_request", {operation: "list_chats"}):
        LOOP:
            url = next_link OR "{graph_base_url}/me/chats"

            response = transport.get(url, auth_headers(token))

            IF response.status == 200:
                page = parse_json(response.body)

                FOR item IN page.value:
                    chats.append(Chat {
                        id: item.id,
                        topic: item.topic,
                        chat_type: parse_chat_type(item.chatType),
                        created_date_time: parse_datetime(item.createdDateTime)
                    })

                next_link = page["@odata.nextLink"]
                IF next_link IS NULL:
                    BREAK
            ELSE:
                RETURN Err(map_graph_error(response))

        RETURN Ok(chats)

FUNCTION GraphService.create_chat(params) -> Result<Chat>:
    token = get_graph_token(credential, config.tenant_id)?

    body = {
        "chatType": params.chat_type.to_string(),
        "members": params.members.map(|m| {
            "@odata.type": "#microsoft.graph.aadUserConversationMember",
            "roles": ["owner"],
            "user@odata.bind": "https://graph.microsoft.com/v1.0/users('{m.user_id}')"
        })
    }

    IF params.topic.is_some():
        body.topic = params.topic

    url = "{graph_base_url}/chats"

    WITH span("teams.graph_request", {operation: "create_chat", chat_type: params.chat_type}):
        response = transport.post(url, body, auth_headers(token))

        IF response.status == 201:
            item = parse_json(response.body)
            RETURN Ok(Chat {
                id: item.id,
                topic: item.topic,
                chat_type: parse_chat_type(item.chatType),
                created_date_time: parse_datetime(item.createdDateTime)
            })
        ELSE:
            RETURN Err(map_graph_error(response))
```

### 4.3 Messaging via Graph

```pseudocode
FUNCTION GraphService.send_channel_message(team_id, channel_id, message) -> Result<ChatMessage>:
    token = get_graph_token(credential, config.tenant_id)?

    body = build_chat_message_body(message)

    url = "{graph_base_url}/teams/{team_id}/channels/{channel_id}/messages"

    WITH span("teams.graph_request", {operation: "send_channel_message", team_id, channel_id}):
        response = transport.post(url, body, auth_headers(token))

        emit_metric("teams_message_sent_total", {
            method: "graph",
            destination_type: "channel",
            status: response.status < 300 ? "success" : "failure"
        })

        IF response.status == 201:
            RETURN Ok(parse_chat_message(response.body))
        ELSE IF response.status == 404:
            RETURN Err(ChannelNotFound { channel_id })
        ELSE:
            RETURN Err(map_graph_error(response))

FUNCTION GraphService.reply_to_channel_message(team_id, channel_id, message_id, reply) -> Result<ChatMessage>:
    token = get_graph_token(credential, config.tenant_id)?

    body = build_chat_message_body(reply)

    url = "{graph_base_url}/teams/{team_id}/channels/{channel_id}/messages/{message_id}/replies"

    WITH span("teams.graph_request", {operation: "reply_to_message", team_id, channel_id, message_id}):
        response = transport.post(url, body, auth_headers(token))

        IF response.status == 201:
            RETURN Ok(parse_chat_message(response.body))
        ELSE:
            RETURN Err(map_graph_error(response))

FUNCTION GraphService.send_chat_message(chat_id, message) -> Result<ChatMessage>:
    token = get_graph_token(credential, config.tenant_id)?

    body = build_chat_message_body(message)

    url = "{graph_base_url}/chats/{chat_id}/messages"

    WITH span("teams.graph_request", {operation: "send_chat_message", chat_id}):
        response = transport.post(url, body, auth_headers(token))

        emit_metric("teams_message_sent_total", {
            method: "graph",
            destination_type: "chat",
            status: response.status < 300 ? "success" : "failure"
        })

        IF response.status == 201:
            RETURN Ok(parse_chat_message(response.body))
        ELSE IF response.status == 404:
            RETURN Err(ChatNotFound { chat_id })
        ELSE:
            RETURN Err(map_graph_error(response))

FUNCTION build_chat_message_body(message: ChatMessage) -> Object:
    body = {
        "body": {
            "contentType": message.body.content_type.to_string(),
            "content": message.body.content
        }
    }

    IF message.importance != MessageImportance::Normal:
        body.importance = message.importance.to_string().toLowerCase()

    IF message.mentions.is_not_empty():
        body.mentions = message.mentions.map(|m| {
            "id": m.id,
            "mentionText": m.mention_text,
            "mentioned": {
                "user": { "id": m.user_id, "displayName": m.display_name }
            }
        })

    IF message.attachments.is_not_empty():
        body.attachments = message.attachments.map(build_attachment)

    RETURN body
```

---

## 5. CardBuilder Implementation

### 5.1 Fluent Card Construction

```pseudocode
CLASS CardBuilder:
    schema: String = "http://adaptivecards.io/schemas/adaptive-card.json"
    version: String = "1.5"
    body: Vec<CardElement> = []
    actions: Vec<CardAction> = []

    FUNCTION new() -> CardBuilder:
        RETURN CardBuilder { schema, version, body: [], actions: [] }

    FUNCTION text_block(self, text: String) -> CardBuilder:
        self.body.append(CardElement::TextBlock {
            element_type: "TextBlock",
            text: text,
            wrap: true
        })
        RETURN self

    FUNCTION text_block_styled(self, text: String, style: TextStyle) -> CardBuilder:
        self.body.append(CardElement::TextBlock {
            element_type: "TextBlock",
            text: text,
            wrap: true,
            size: style.size,
            weight: style.weight,
            color: style.color,
            is_subtle: style.is_subtle
        })
        RETURN self

    FUNCTION fact_set(self, facts: Vec<Fact>) -> CardBuilder:
        self.body.append(CardElement::FactSet {
            element_type: "FactSet",
            facts: facts.map(|f| { "title": f.title, "value": f.value })
        })
        RETURN self

    FUNCTION image(self, url: String, alt_text: String) -> CardBuilder:
        self.body.append(CardElement::Image {
            element_type: "Image",
            url: url,
            alt_text: alt_text
        })
        RETURN self

    FUNCTION column_set(self, columns: Vec<Column>) -> CardBuilder:
        self.body.append(CardElement::ColumnSet {
            element_type: "ColumnSet",
            columns: columns.map(|c| {
                "type": "Column",
                "width": c.width,
                "items": c.items
            })
        })
        RETURN self

    FUNCTION action_open_url(self, title: String, url: String) -> CardBuilder:
        self.actions.append(CardAction::OpenUrl {
            action_type: "Action.OpenUrl",
            title: title,
            url: url
        })
        RETURN self

    FUNCTION action_submit(self, title: String, data: Value) -> CardBuilder:
        self.actions.append(CardAction::Submit {
            action_type: "Action.Submit",
            title: title,
            data: data
        })
        RETURN self

    FUNCTION action_execute(self, title: String, verb: String, data: Value) -> CardBuilder:
        self.actions.append(CardAction::Execute {
            action_type: "Action.Execute",
            title: title,
            verb: verb,
            data: data
        })
        RETURN self

    FUNCTION build(self) -> AdaptiveCard:
        RETURN AdaptiveCard {
            schema: self.schema,
            card_type: "AdaptiveCard",
            version: self.version,
            body: self.body,
            actions: self.actions
        }
```

### 5.2 Card Validation

```pseudocode
FUNCTION validate_adaptive_card(card: AdaptiveCard) -> Result<()>:
    // Validate version
    IF NOT ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5"].contains(card.version):
        RETURN Err(CardValidationFailed { message: "Invalid card version" })

    // Validate body not empty
    IF card.body.is_empty():
        RETURN Err(CardValidationFailed { message: "Card body cannot be empty" })

    // Validate action URLs
    FOR action IN card.actions:
        IF action IS OpenUrl:
            IF NOT is_valid_url(action.url):
                RETURN Err(CardValidationFailed { message: "Invalid action URL" })

    // Validate total size
    card_json = card.to_json()
    IF card_json.len() > 28 * 1024:  // 28KB limit for Teams
        RETURN Err(CardValidationFailed { message: "Card exceeds 28KB limit" })

    RETURN Ok(())
```

---

## 6. Message Router Implementation

### 6.1 Router Operations

```pseudocode
CLASS MessageRouter:
    rules: Vec<RoutingRule>
    default_destination: Option<Destination>
    client: TeamsClient

    FUNCTION new(client: TeamsClient, config: RoutingConfig) -> MessageRouter:
        rules = config.rules.sort_by(|a, b| b.priority.cmp(a.priority))
        RETURN MessageRouter {
            rules: rules,
            default_destination: config.default_destination,
            client: client
        }

    FUNCTION route(self, message: RoutableMessage) -> Result<Vec<DeliveryResult>>:
        destinations = []

        // Find matching rules
        FOR rule IN self.rules:
            IF rule_matches(rule, message):
                destinations.append(rule.destination)

        // Use default if no matches
        IF destinations.is_empty() AND self.default_destination.is_some():
            destinations.append(self.default_destination)

        IF destinations.is_empty():
            RETURN Err(NoRouteFound { message_id: message.id })

        // Deliver to all matched destinations
        results = []
        FOR destination IN destinations:
            result = deliver_to_destination(self.client, destination, message).await
            results.append(DeliveryResult {
                destination: destination,
                success: result.is_ok(),
                error: result.err(),
                message_id: result.ok().map(|r| r.message_id)
            })

        RETURN Ok(results)

    FUNCTION add_rule(self, rule: RoutingRule):
        self.rules.append(rule)
        self.rules.sort_by(|a, b| b.priority.cmp(a.priority))

    FUNCTION remove_rule(self, name: String) -> Option<RoutingRule>:
        index = self.rules.find_index(|r| r.name == name)
        IF index.is_some():
            RETURN Some(self.rules.remove(index))
        RETURN None

FUNCTION rule_matches(rule: RoutingRule, message: RoutableMessage) -> bool:
    FOR condition IN rule.conditions:
        IF NOT condition_matches(condition, message):
            RETURN false
    RETURN true

FUNCTION condition_matches(condition: RoutingCondition, message: RoutableMessage) -> bool:
    MATCH condition:
        RoutingCondition::Tag(tag) =>
            RETURN message.tags.contains(tag)

        RoutingCondition::Severity(severity) =>
            RETURN message.severity == severity

        RoutingCondition::Source(source) =>
            RETURN message.source == source

        RoutingCondition::Custom(predicate) =>
            RETURN predicate(message)

FUNCTION deliver_to_destination(client, destination, message) -> Result<DeliveryResponse>:
    MATCH destination:
        Destination::Channel { team_id, channel_id } =>
            chat_message = message.to_chat_message()
            result = client.graph().send_channel_message(team_id, channel_id, chat_message).await?
            RETURN Ok(DeliveryResponse { message_id: result.id })

        Destination::Chat { chat_id } =>
            chat_message = message.to_chat_message()
            result = client.graph().send_chat_message(chat_id, chat_message).await?
            RETURN Ok(DeliveryResponse { message_id: result.id })

        Destination::User { user_id } =>
            // Create or get 1:1 chat, then send
            chat = client.graph().get_or_create_user_chat(user_id).await?
            chat_message = message.to_chat_message()
            result = client.graph().send_chat_message(chat.id, chat_message).await?
            RETURN Ok(DeliveryResponse { message_id: result.id })

        Destination::Webhook { url } =>
            result = client.webhook().send_formatted_message(url, message.to_formatted()).await?
            RETURN Ok(DeliveryResponse { message_id: None })
```

---

## 7. Error Handling

### 7.1 Error Mapping

```pseudocode
FUNCTION map_graph_error(response: HttpResponse) -> TeamsError:
    status = response.status
    body = try_parse_json(response.body)
    error_code = body?.error?.code
    error_message = body?.error?.message OR "Unknown error"

    MATCH status:
        401 => AuthenticationFailed { message: error_message }

        403 =>
            IF error_code == "Authorization_RequestDenied":
                InsufficientPermissions { permission: extract_permission(error_message) }
            ELSE:
                AccessDenied { resource: "graph", message: error_message }

        404 =>
            // Determine resource type from URL or error
            IF error_message.contains("team"):
                TeamNotFound { team_id: extract_id(error_message) }
            ELSE IF error_message.contains("channel"):
                ChannelNotFound { channel_id: extract_id(error_message) }
            ELSE IF error_message.contains("chat"):
                ChatNotFound { chat_id: extract_id(error_message) }
            ELSE:
                ResourceNotFound { resource: error_message }

        429 =>
            retry_after = parse_retry_after(response.headers)
            RateLimited { retry_after_ms: retry_after }

        500 => InternalError { message: error_message }

        502, 503 => ServiceUnavailable { message: error_message }

        _ => UnexpectedError { status, message: error_message }

FUNCTION map_bot_error(response: HttpResponse) -> TeamsError:
    status = response.status
    body = try_parse_json(response.body)

    MATCH status:
        401 => AuthenticationFailed { message: body?.message OR "Bot authentication failed" }
        403 => AccessDenied { resource: "bot", message: body?.message }
        404 => ConversationNotFound { conversation_id: extract_conversation_id(response.url) }
        429 => RateLimited { retry_after_ms: parse_retry_after(response.headers) }
        _ => MessageDeliveryFailed { message: body?.message OR "Unknown error" }
```

---

## 8. Simulation and Replay

### 8.1 Mock Client

```pseudocode
CLASS MockTeamsClient:
    sent_messages: Vec<SentMessage>
    channels: HashMap<String, Vec<Channel>>
    chats: HashMap<String, Chat>
    teams: Vec<Team>
    webhook_responses: HashMap<String, WebhookResponse>
    should_fail: HashMap<String, TeamsError>

    FUNCTION register_team(self, team: Team):
        self.teams.append(team)
        self.channels.insert(team.id, [])

    FUNCTION register_channel(self, team_id: String, channel: Channel):
        self.channels.get_mut(team_id)?.append(channel)

    FUNCTION register_chat(self, chat: Chat):
        self.chats.insert(chat.id, chat)

    FUNCTION set_webhook_response(self, url_pattern: String, response: WebhookResponse):
        self.webhook_responses.insert(url_pattern, response)

    FUNCTION simulate_failure(self, operation: String, error: TeamsError):
        self.should_fail.insert(operation, error)

    FUNCTION get_sent_messages(self) -> Vec<SentMessage>:
        RETURN self.sent_messages.clone()

    FUNCTION clear_sent_messages(self):
        self.sent_messages.clear()

    FUNCTION simulate_incoming(self, activity: Activity) -> Result<()>:
        // Process as if received from Teams
        RETURN self.bot_service.process_activity(activity, self.handler)

    FUNCTION replay(self, flow: Vec<SentMessage>) -> ReplayResult:
        results = []

        FOR message IN flow:
            // Re-send each message
            result = self.send_to_destination(message.destination, message.content).await
            results.append(ReplayEntry {
                original: message,
                replayed: result.is_ok(),
                error: result.err()
            })

        RETURN ReplayResult {
            total: results.len(),
            successful: results.count(|r| r.replayed),
            failed: results.count(|r| !r.replayed),
            entries: results
        }
```

---

## 9. Utility Functions

```pseudocode
FUNCTION sanitize_html(content: String) -> String:
    // Escape HTML special characters
    RETURN content
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;")

FUNCTION build_mention(user_id: String, display_name: String) -> String:
    // Format: <at id="user_id">display_name</at>
    RETURN "<at id=\"{user_id}\">{display_name}</at>"

FUNCTION parse_retry_after(headers: Headers) -> u64:
    retry_after = headers.get("Retry-After")

    IF retry_after IS NULL:
        RETURN 1000  // Default 1 second

    IF is_numeric(retry_after):
        RETURN parse_int(retry_after) * 1000
    ELSE:
        date = parse_http_date(retry_after)
        RETURN max(0, (date - now()).milliseconds())

FUNCTION is_valid_url(url: String) -> bool:
    parsed = try_parse_url(url)
    IF parsed IS NULL:
        RETURN false
    RETURN parsed.scheme IN ["http", "https"]
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-microsoft-teams.md | Complete |
| 2. Pseudocode | pseudocode-microsoft-teams.md | Complete |
| 3. Architecture | architecture-microsoft-teams.md | Pending |
| 4. Refinement | refinement-microsoft-teams.md | Pending |
| 5. Completion | completion-microsoft-teams.md | Pending |

---

*Phase 2: Pseudocode - Complete*
