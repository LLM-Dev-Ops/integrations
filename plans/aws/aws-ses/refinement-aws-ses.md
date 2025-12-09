# AWS SES Integration Refinement

## SPARC Phase 4: Refinement

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| SendEmail operation | ✅ Covered | Pseudocode-2, simple/raw/template content |
| SendBulkEmail operation | ✅ Covered | Pseudocode-2, up to 50 recipients |
| CreateEmailTemplate | ✅ Covered | Pseudocode-2 |
| GetEmailTemplate | ✅ Covered | Pseudocode-2 |
| UpdateEmailTemplate | ✅ Covered | Pseudocode-2 |
| DeleteEmailTemplate | ✅ Covered | Pseudocode-2 |
| ListEmailTemplates | ✅ Covered | Pseudocode-2, pagination |
| CreateEmailIdentity | ✅ Covered | Pseudocode-2 |
| GetEmailIdentity | ✅ Covered | Pseudocode-2 |
| DeleteEmailIdentity | ✅ Covered | Pseudocode-2 |
| ListEmailIdentities | ✅ Covered | Pseudocode-2, pagination |
| PutEmailIdentityDkimAttributes | ✅ Covered | Pseudocode-2 |
| PutEmailIdentityMailFromAttributes | ✅ Covered | Pseudocode-2 |
| CreateConfigurationSet | ✅ Covered | Pseudocode-3 |
| GetConfigurationSet | ✅ Covered | Pseudocode-3 |
| DeleteConfigurationSet | ✅ Covered | Pseudocode-3 |
| ListConfigurationSets | ✅ Covered | Pseudocode-3 |
| PutConfigurationSetDeliveryOptions | ✅ Covered | Pseudocode-3 |
| PutConfigurationSetReputationOptions | ✅ Covered | Pseudocode-3 |
| PutConfigurationSetSendingOptions | ✅ Covered | Pseudocode-3 |
| PutConfigurationSetTrackingOptions | ✅ Covered | Pseudocode-3 |
| PutConfigurationSetSuppressionOptions | ✅ Covered | Pseudocode-3 |
| PutConfigurationSetVdmOptions | ✅ Covered | Pseudocode-3 |
| CreateConfigurationSetEventDestination | ✅ Covered | Pseudocode-3 |
| GetConfigurationSetEventDestinations | ✅ Covered | Pseudocode-3 |
| DeleteConfigurationSetEventDestination | ✅ Covered | Pseudocode-3 |
| PutSuppressedDestination | ✅ Covered | Pseudocode-3 |
| GetSuppressedDestination | ✅ Covered | Pseudocode-3 |
| DeleteSuppressedDestination | ✅ Covered | Pseudocode-3 |
| ListSuppressedDestinations | ✅ Covered | Pseudocode-3, pagination |
| CreateContactList | ✅ Covered | Pseudocode-3 |
| GetContactList | ✅ Covered | Pseudocode-3 |
| UpdateContactList | ✅ Covered | Pseudocode-3 |
| DeleteContactList | ✅ Covered | Pseudocode-3 |
| ListContactLists | ✅ Covered | Pseudocode-3 |
| CreateContact | ✅ Covered | Pseudocode-3 |
| GetContact | ✅ Covered | Pseudocode-3 |
| UpdateContact | ✅ Covered | Pseudocode-3 |
| DeleteContact | ✅ Covered | Pseudocode-3 |
| ListContacts | ✅ Covered | Pseudocode-3, pagination |
| GetAccount | ✅ Covered | Pseudocode-4 |
| PutAccountSendingAttributes | ✅ Covered | Pseudocode-4 |
| PutAccountSuppressionAttributes | ✅ Covered | Pseudocode-4 |
| PutAccountDetails | ✅ Covered | Pseudocode-4 |
| AWS Signature V4 | ✅ Covered | Pseudocode-1 |
| Credential providers | ✅ Covered | Pseudocode-1 (Env, Profile, IMDS) |
| Retry with backoff | ✅ Covered | Uses shared retry primitive |
| Circuit breaker | ✅ Covered | Uses shared circuit-breaker primitive |
| Rate limiting | ✅ Covered | Uses shared rate-limits primitive |
| Tracing integration | ✅ Covered | Uses shared tracing primitive |
| Structured logging | ✅ Covered | Uses shared logging primitive |
| Error taxonomy | ✅ Covered | Uses shared errors primitive |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Hexagonal Architecture | ✅ | Ports (traits) + Adapters pattern |
| Dependency Inversion | ✅ | All deps injected via traits |
| Single Responsibility | ✅ | Separate services per domain |
| Interface Segregation | ✅ | Fine-grained service traits |
| No ruvbase dependency | ✅ | Only shared primitives used |
| No cross-module deps | ✅ | Self-contained module |
| London-School TDD ready | ✅ | All collaborators mockable |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Credentials never logged | ✅ | SecretString wrapper, redacted Debug |
| TLS enforced | ✅ | HTTPS default, configurable for local |
| Signature V4 | ✅ | Full implementation in Pseudocode-1 |
| Session token support | ✅ | Included in credential chain |
| Email content not logged | ✅ | Only metadata logged |
| Template data sanitized | ✅ | PII not logged |
| Content hash validation | ✅ | SHA-256 for signed requests |

---

## 2. Edge Case Analysis

### 2.1 Email Address Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMAIL ADDRESS EDGE CASES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Special Characters in Email Addresses                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Valid but uncommon:                                                 │   │
│  │  - Plus addressing: "user+tag@example.com"                          │   │
│  │  - Quoted local: "\"user name\"@example.com"                        │   │
│  │  - Dots: "user.name@example.com"                                    │   │
│  │  - Unicode domains (IDN): "user@例え.jp"                            │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  - Use lenient email validation (regex too strict often fails)     │   │
│  │  - Let SES perform authoritative validation                        │   │
│  │  - Handle SES errors gracefully                                     │   │
│  │                                                                      │   │
│  │  fn validate_email_basic(email: &str) -> Result<(), SesError> {    │   │
│  │      if email.is_empty() {                                          │   │
│  │          return Err(SesError::InvalidEmail("Empty email"));        │   │
│  │      }                                                               │   │
│  │      if !email.contains('@') {                                       │   │
│  │          return Err(SesError::InvalidEmail("Missing @"));          │   │
│  │      }                                                               │   │
│  │      if email.len() > 254 {                                         │   │
│  │          return Err(SesError::InvalidEmail("Too long"));           │   │
│  │      }                                                               │   │
│  │      Ok(()) // Let SES handle detailed validation                   │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Display Names with Special Characters                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Format: "Display Name <email@example.com>"                         │   │
│  │                                                                      │   │
│  │  Edge cases:                                                         │   │
│  │  - Quotes in name: "John \"JD\" Doe <jd@example.com>"              │   │
│  │  - Unicode names: "日本語 <jp@example.com>"                         │   │
│  │  - Angle brackets: "Name <with> angles <user@example.com>"          │   │
│  │                                                                      │   │
│  │  Solution: Properly quote and encode display names                  │   │
│  │                                                                      │   │
│  │  fn format_email_address(name: Option<&str>, email: &str) -> String{│   │
│  │      match name {                                                    │   │
│  │          Some(n) if needs_quoting(n) => {                           │   │
│  │              format!("\"{}\" <{}>", escape_quotes(n), email)        │   │
│  │          }                                                           │   │
│  │          Some(n) => format!("{} <{}>", n, email),                   │   │
│  │          None => email.to_string(),                                 │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Empty Recipient Lists                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - All fields empty: to=[], cc=[], bcc=[]                           │   │
│  │  - Valid: at least one recipient required                           │   │
│  │                                                                      │   │
│  │  Validation:                                                         │   │
│  │  fn validate_destination(dest: &Destination) -> Result<(), Error> { │   │
│  │      let total = dest.to_addresses.len()                            │   │
│  │          + dest.cc_addresses.len()                                  │   │
│  │          + dest.bcc_addresses.len();                                │   │
│  │                                                                      │   │
│  │      if total == 0 {                                                 │   │
│  │          return Err(SesError::NoRecipients);                        │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      if total > 50 {                                                 │   │
│  │          return Err(SesError::TooManyRecipients(total));            │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Suppressed Addresses                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Sending to address on suppression list                   │   │
│  │                                                                      │   │
│  │  SES Behavior:                                                       │   │
│  │  - Email silently dropped (no error)                                │   │
│  │  - Message ID still returned                                        │   │
│  │  - Event logged if configured                                       │   │
│  │                                                                      │   │
│  │  Recommendation:                                                     │   │
│  │  - Document this behavior clearly                                   │   │
│  │  - Provide method to check suppression status                       │   │
│  │  - Support pre-send suppression check (optional)                    │   │
│  │                                                                      │   │
│  │  async fn check_suppression(                                         │   │
│  │      &self,                                                          │   │
│  │      emails: &[&str]                                                 │   │
│  │  ) -> Result<Vec<SuppressionStatus>, SesError> {                    │   │
│  │      // Check each email against suppression list                   │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Email Content Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMAIL CONTENT EDGE CASES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Character Encoding Issues                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Non-UTF8 content in subject/body                                 │   │
│  │  - Mixed encodings in HTML                                          │   │
│  │  - Emoji in subject line                                            │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  - Default charset: UTF-8                                           │   │
│  │  - Validate UTF-8 before sending                                    │   │
│  │  - Support explicit charset override                                │   │
│  │                                                                      │   │
│  │  fn validate_content_encoding(content: &Content) -> Result<(), Err> │   │
│  │  {                                                                   │   │
│  │      // Validate UTF-8 if charset is UTF-8                          │   │
│  │      if content.charset.as_deref() == Some("UTF-8") {               │   │
│  │          std::str::from_utf8(content.data.as_bytes())?;             │   │
│  │      }                                                               │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Large Email Bodies                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  SES Limits:                                                         │   │
│  │  - Message size: 10 MB (simple email)                               │   │
│  │  - Raw message: 40 MB (with attachments via raw)                    │   │
│  │                                                                      │   │
│  │  Validation:                                                         │   │
│  │  fn validate_email_size(request: &SendEmailRequest) -> Result<()> { │   │
│  │      let estimated_size = estimate_message_size(request);           │   │
│  │                                                                      │   │
│  │      const MAX_SIZE: usize = 10 * 1024 * 1024; // 10 MB             │   │
│  │                                                                      │   │
│  │      if estimated_size > MAX_SIZE {                                  │   │
│  │          return Err(SesError::MessageTooLarge {                     │   │
│  │              size: estimated_size,                                   │   │
│  │              limit: MAX_SIZE,                                        │   │
│  │          });                                                         │   │
│  │      }                                                               │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: HTML/Text Body Mismatch                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Only HTML provided (no text fallback)                            │   │
│  │  - Only text provided (no HTML)                                     │   │
│  │  - Both provided with different content                             │   │
│  │                                                                      │   │
│  │  Best Practice:                                                      │   │
│  │  - Both HTML and text recommended for deliverability               │   │
│  │  - Log warning if only one provided                                 │   │
│  │  - Document behavior for email clients                              │   │
│  │                                                                      │   │
│  │  fn validate_body(body: &Body) -> Result<(), ValidationWarning> {   │   │
│  │      match (&body.text, &body.html) {                                │   │
│  │          (None, None) => Err(ValidationError::EmptyBody),           │   │
│  │          (Some(_), None) => {                                        │   │
│  │              warn!("No HTML body - may affect rendering");          │   │
│  │              Ok(())                                                  │   │
│  │          }                                                           │   │
│  │          (None, Some(_)) => {                                        │   │
│  │              warn!("No text body - may affect deliverability");     │   │
│  │              Ok(())                                                  │   │
│  │          }                                                           │   │
│  │          (Some(_), Some(_)) => Ok(()),                              │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Raw Email MIME Issues                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Invalid MIME structure                                           │   │
│  │  - Missing required headers                                         │   │
│  │  - Malformed multipart boundaries                                   │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  - Minimal validation (let SES handle MIME parsing)                 │   │
│  │  - Validate required headers present                                │   │
│  │  - Base64 encode raw content for transport                          │   │
│  │                                                                      │   │
│  │  fn validate_raw_message(data: &[u8]) -> Result<(), SesError> {     │   │
│  │      // Check for required headers                                  │   │
│  │      let header_end = find_header_end(data)?;                       │   │
│  │      let headers = &data[..header_end];                             │   │
│  │                                                                      │   │
│  │      // Must have From header                                       │   │
│  │      if !contains_header(headers, b"From:") {                       │   │
│  │          return Err(SesError::MissingFromHeader);                   │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Must have Subject header                                    │   │
│  │      if !contains_header(headers, b"Subject:") {                    │   │
│  │          return Err(SesError::MissingSubjectHeader);                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Template Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEMPLATE EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Template Variable Edge Cases                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Missing variable in template data                                │   │
│  │  - Extra variables not in template                                  │   │
│  │  - Nested JSON objects as values                                    │   │
│  │  - Very long variable values                                        │   │
│  │                                                                      │   │
│  │  SES Template Syntax: {{variable_name}}                             │   │
│  │                                                                      │   │
│  │  Behavior:                                                           │   │
│  │  - Missing variable: Renders as empty string                        │   │
│  │  - Extra variable: Ignored                                          │   │
│  │  - Nested object: Serialized as JSON string                         │   │
│  │                                                                      │   │
│  │  Recommendation:                                                     │   │
│  │  - Document variable behavior clearly                               │   │
│  │  - Consider optional pre-send variable validation                   │   │
│  │                                                                      │   │
│  │  fn validate_template_data(                                          │   │
│  │      template_data: &str,                                            │   │
│  │  ) -> Result<serde_json::Value, SesError> {                         │   │
│  │      serde_json::from_str(template_data)                            │   │
│  │          .map_err(|e| SesError::InvalidTemplateData(e.to_string())) │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Template Name Collisions                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Creating template with existing name                             │   │
│  │  - Case sensitivity: "MyTemplate" vs "mytemplate"                   │   │
│  │                                                                      │   │
│  │  SES Behavior:                                                       │   │
│  │  - Names are case-sensitive                                         │   │
│  │  - Duplicate name: AlreadyExistsException                           │   │
│  │                                                                      │   │
│  │  Error Handling:                                                     │   │
│  │  fn create_template(...) -> Result<(), SesError> {                  │   │
│  │      match self.execute(...).await {                                 │   │
│  │          Err(e) if e.is_already_exists() => {                       │   │
│  │              Err(SesError::TemplateAlreadyExists {                  │   │
│  │                  name: template_name.clone(),                        │   │
│  │              })                                                      │   │
│  │          }                                                           │   │
│  │          other => other,                                             │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Large Template Content                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  SES Limits:                                                         │   │
│  │  - Subject: 998 characters                                          │   │
│  │  - Template size: 500 KB                                            │   │
│  │                                                                      │   │
│  │  Validation:                                                         │   │
│  │  fn validate_template(template: &CreateTemplateRequest) -> Result<> │   │
│  │  {                                                                   │   │
│  │      const MAX_SUBJECT_LEN: usize = 998;                            │   │
│  │      const MAX_TEMPLATE_SIZE: usize = 500 * 1024;                   │   │
│  │                                                                      │   │
│  │      if template.subject.len() > MAX_SUBJECT_LEN {                  │   │
│  │          return Err(SesError::SubjectTooLong);                      │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      let total_size = template.subject.len()                        │   │
│  │          + template.text.as_ref().map_or(0, |t| t.len())            │   │
│  │          + template.html.as_ref().map_or(0, |h| h.len());           │   │
│  │                                                                      │   │
│  │      if total_size > MAX_TEMPLATE_SIZE {                            │   │
│  │          return Err(SesError::TemplateTooLarge);                    │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Identity Verification Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   IDENTITY VERIFICATION EDGE CASES                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Domain Verification Timing                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Domain verification takes 24-72 hours                    │   │
│  │                                                                      │   │
│  │  Polling Strategy:                                                   │   │
│  │  - Initial poll: After 5 minutes                                   │   │
│  │  - Subsequent: Exponential backoff up to 1 hour                     │   │
│  │  - Max duration: 72 hours                                           │   │
│  │                                                                      │   │
│  │  async fn wait_for_verification(                                     │   │
│  │      &self,                                                          │   │
│  │      identity: &str,                                                 │   │
│  │      timeout: Duration,                                              │   │
│  │  ) -> Result<VerificationStatus, SesError> {                        │   │
│  │      let start = Instant::now();                                     │   │
│  │      let mut delay = Duration::from_secs(300); // 5 min             │   │
│  │                                                                      │   │
│  │      loop {                                                          │   │
│  │          let status = self.get_identity(identity).await?;           │   │
│  │          if status.verification_status == "SUCCESS" {               │   │
│  │              return Ok(status);                                      │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          if start.elapsed() > timeout {                              │   │
│  │              return Err(SesError::VerificationTimeout);             │   │
│  │          }                                                           │   │
│  │                                                                      │   │
│  │          tokio::time::sleep(delay).await;                           │   │
│  │          delay = (delay * 2).min(Duration::from_secs(3600));        │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Subdomain vs Parent Domain                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario:                                                           │   │
│  │  - Parent domain verified: example.com                              │   │
│  │  - Want to send from: subdomain.example.com                         │   │
│  │                                                                      │   │
│  │  SES Behavior:                                                       │   │
│  │  - Subdomains NOT automatically verified                            │   │
│  │  - Must verify each subdomain separately                            │   │
│  │  - Or verify specific email addresses                               │   │
│  │                                                                      │   │
│  │  Documentation:                                                      │   │
│  │  - Clear guidance on subdomain handling                             │   │
│  │  - Example showing subdomain verification                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: DKIM Key Rotation                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Customer wants to rotate DKIM keys                       │   │
│  │                                                                      │   │
│  │  Process:                                                            │   │
│  │  1. put_dkim_attributes with new signing enabled                    │   │
│  │  2. SES generates new DKIM tokens                                   │   │
│  │  3. Add new CNAME records alongside old                             │   │
│  │  4. Wait for propagation                                            │   │
│  │  5. Remove old CNAME records                                        │   │
│  │                                                                      │   │
│  │  Edge Case: DNS propagation delay                                   │   │
│  │  - Old keys valid during transition                                 │   │
│  │  - Recommend 48-hour overlap period                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Credential Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Credential Expiration During Bulk Send                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Session credentials expire during bulk email batch       │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Check credential expiration before each batch                   │   │
│  │  2. Refresh credentials if within 5-minute window                   │   │
│  │  3. Re-sign request with new credentials                            │   │
│  │  4. If refresh fails, fail the entire batch (not partial)           │   │
│  │                                                                      │   │
│  │  fn credentials_need_refresh(creds: &Credentials) -> bool {         │   │
│  │      match creds.expiration {                                        │   │
│  │          Some(exp) => exp - Utc::now() < Duration::minutes(5),      │   │
│  │          None => false,  // Long-term credentials                   │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: IMDS Unavailability                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Running outside EC2/ECS: IMDS not available                      │   │
│  │  - IMDS rate limited: Temporary failure                             │   │
│  │  - IMDS disabled: Permanent failure                                 │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Quick timeout for IMDS (1 second)                               │   │
│  │  2. Fall through to next provider on failure                        │   │
│  │  3. Cache IMDS availability status                                  │   │
│  │  4. Use IMDSv2 (token-based) for security                           │   │
│  │                                                                      │   │
│  │  IMDS v2 Flow:                                                       │   │
│  │  1. PUT /latest/api/token (get session token)                       │   │
│  │  2. GET /latest/meta-data/iam/security-credentials/                 │   │
│  │  3. GET /latest/meta-data/iam/security-credentials/{role}           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Concurrent Credential Refresh                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Multiple requests trigger refresh simultaneously         │   │
│  │                                                                      │   │
│  │  Strategy: Single-flight refresh                                    │   │
│  │  1. First request triggers refresh                                  │   │
│  │  2. Subsequent requests wait for first to complete                  │   │
│  │  3. All requests use new credentials                                │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  struct CredentialCache {                                            │   │
│  │      credentials: RwLock<Option<Credentials>>,                      │   │
│  │      refresh_lock: Mutex<()>,  // Serialize refreshes               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Rate Limiting Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RATE LIMITING EDGE CASES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Sandbox Mode Restrictions                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Sandbox Limits:                                                     │   │
│  │  - 200 emails per 24-hour period                                    │   │
│  │  - 1 email per second                                               │   │
│  │  - Can only send to verified addresses                              │   │
│  │                                                                      │   │
│  │  Detection:                                                          │   │
│  │  async fn check_sandbox_mode(&self) -> Result<bool, SesError> {     │   │
│  │      let account = self.account().get().await?;                     │   │
│  │      Ok(account.production_access_enabled == false)                 │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  User Experience:                                                    │   │
│  │  - Clear error when hitting sandbox limits                          │   │
│  │  - Link to production access request                                │   │
│  │  - Log warning on client creation if sandbox                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Sending Quota Exhausted                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Daily sending quota exceeded                             │   │
│  │                                                                      │   │
│  │  SES Response: DailyQuotaExceeded error                             │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  - Not retryable (quota resets at midnight UTC)                     │   │
│  │  - Provide quota info in error                                      │   │
│  │  - Track quota usage in metrics                                     │   │
│  │                                                                      │   │
│  │  struct QuotaExceededError {                                         │   │
│  │      max_24_hour_send: u64,                                          │   │
│  │      sent_last_24_hours: u64,                                        │   │
│  │      reset_time: DateTime<Utc>,                                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Per-Second Rate Limiting                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Exceeding max send rate                                  │   │
│  │                                                                      │   │
│  │  SES Response: Throttling error (HTTP 429)                          │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  - Client-side rate limiting based on account quota                 │   │
│  │  - Honor Retry-After header when throttled                          │   │
│  │  - Exponential backoff for sustained throttling                     │   │
│  │                                                                      │   │
│  │  async fn send_with_rate_limit(&self, request: SendEmailRequest) {  │   │
│  │      // Acquire rate limit permit                                   │   │
│  │      self.rate_limiter.acquire().await;                             │   │
│  │                                                                      │   │
│  │      match self.send_internal(request).await {                      │   │
│  │          Err(e) if e.is_throttling() => {                           │   │
│  │              let retry_after = e.retry_after().unwrap_or(1.0);      │   │
│  │              tokio::time::sleep(Duration::from_secs_f64(retry_after)).await;│
│  │              // Retry with backoff                                  │   │
│  │          }                                                           │   │
│  │          result => result,                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Optimizations

### 3.1 Signing Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SIGNING OPTIMIZATIONS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Signing Key Cache                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Deriving signing key requires 4 HMAC operations           │   │
│  │                                                                      │   │
│  │  Solution: Cache derived signing key per (date, region, service)    │   │
│  │                                                                      │   │
│  │  struct SigningKeyCache {                                            │   │
│  │      cache: HashMap<(Date, String, String), CachedKey>,             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  struct CachedKey {                                                  │   │
│  │      key: [u8; 32],                                                  │   │
│  │      created: DateTime<Utc>,                                         │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Eviction: On date change or max entries (e.g., 10)                 │   │
│  │  Benefit: ~4x speedup for repeated requests                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Buffer Reuse                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Each signing allocates buffers for canonical request      │   │
│  │                                                                      │   │
│  │  Solution: Thread-local buffer pool                                 │   │
│  │                                                                      │   │
│  │  thread_local! {                                                     │   │
│  │      static SIGNING_BUFFER: RefCell<Vec<u8>> =                      │   │
│  │          RefCell::new(Vec::with_capacity(4096));                    │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn sign_request(request: &Request) -> Signature {                  │   │
│  │      SIGNING_BUFFER.with(|buf| {                                     │   │
│  │          let mut buf = buf.borrow_mut();                            │   │
│  │          buf.clear();                                               │   │
│  │          // Build canonical request into buf                        │   │
│  │      })                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Benefit: Reduces allocations by ~80%                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Bulk Email Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BULK EMAIL OPTIMIZATIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Batch Size Tuning                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  SES Limit: 50 recipients per bulk send call                        │   │
│  │                                                                      │   │
│  │  Considerations:                                                     │   │
│  │  - Larger batches = fewer API calls = lower latency                 │   │
│  │  - Smaller batches = finer error granularity                        │   │
│  │  - Balance based on use case                                        │   │
│  │                                                                      │   │
│  │  Recommendation:                                                     │   │
│  │  - Default: 50 (max allowed)                                        │   │
│  │  - Configurable for specific needs                                  │   │
│  │  - Reduce if many failures expected (personalization errors)        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Parallel Batch Execution                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  For large recipient lists (>50), parallel batch processing         │   │
│  │                                                                      │   │
│  │  async fn send_bulk_parallel(                                        │   │
│  │      &self,                                                          │   │
│  │      entries: Vec<BulkEmailEntry>,                                   │   │
│  │      concurrency: usize,                                             │   │
│  │  ) -> Vec<BulkEmailEntryResult> {                                   │   │
│  │      let batches = entries.chunks(50);                              │   │
│  │      let semaphore = Arc::new(Semaphore::new(concurrency));         │   │
│  │                                                                      │   │
│  │      let futures: Vec<_> = batches                                   │   │
│  │          .map(|batch| {                                              │   │
│  │              let permit = semaphore.clone().acquire_owned();         │   │
│  │              async move {                                            │   │
│  │                  let _permit = permit.await;                         │   │
│  │                  self.send_bulk(batch.to_vec()).await                │   │
│  │              }                                                       │   │
│  │          })                                                          │   │
│  │          .collect();                                                 │   │
│  │                                                                      │   │
│  │      join_all(futures).await.flatten()                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Concurrency limit: min(batch_count, account_rate / 50)             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Template Caching                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  For bulk sends with templates, cache template metadata             │   │
│  │                                                                      │   │
│  │  struct TemplateCache {                                              │   │
│  │      cache: HashMap<String, CachedTemplate>,                        │   │
│  │      ttl: Duration,                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  struct CachedTemplate {                                             │   │
│  │      exists: bool,                                                   │   │
│  │      variables: HashSet<String>,  // Extracted from template        │   │
│  │      cached_at: Instant,                                             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Avoid repeated GetTemplate calls                                 │   │
│  │  - Early validation of template data                                │   │
│  │  - Reduce latency for repeated sends                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Connection Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONNECTION OPTIMIZATIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Connection Warmup                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: First request incurs connection + TLS setup latency       │   │
│  │                                                                      │   │
│  │  Solution: Optional connection warmup on client creation            │   │
│  │                                                                      │   │
│  │  impl SesClient {                                                    │   │
│  │      async fn warmup(&self) -> Result<(), SesError> {               │   │
│  │          // GetAccount is lightweight and establishes connection    │   │
│  │          let _ = self.account().get().await;                        │   │
│  │          Ok(())                                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: HTTP/2 Multiplexing                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  SES v2 supports HTTP/2                                             │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Multiple requests over single connection                         │   │
│  │  - Header compression                                               │   │
│  │  - Reduced latency for concurrent operations                        │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - Enable HTTP/2 by default                                         │   │
│  │  - Fallback to HTTP/1.1 if negotiation fails                        │   │
│  │  - Fewer connections needed with HTTP/2                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Keep-Alive Tuning                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  SES Connection Behavior:                                           │   │
│  │  - Keep connections open for reuse                                  │   │
│  │  - SES servers may close after ~60 seconds idle                     │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - idle_timeout: 50 seconds (before server closes)                  │   │
│  │  - pool_max_idle_per_host: 10                                       │   │
│  │  - tcp_keepalive: 30 seconds                                        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Security Hardening

### 4.1 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT VALIDATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Email Address Validation:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_email_address(email: &str) -> Result<(), ValidationErr>│   │
│  │  {                                                                   │   │
│  │      // Non-empty                                                   │   │
│  │      if email.is_empty() {                                          │   │
│  │          return Err(ValidationError::EmptyEmail);                   │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Contains @                                                  │   │
│  │      if !email.contains('@') {                                       │   │
│  │          return Err(ValidationError::MissingAtSign);                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Max length (RFC 5321)                                       │   │
│  │      if email.len() > 254 {                                         │   │
│  │          return Err(ValidationError::EmailTooLong);                 │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // No null bytes                                               │   │
│  │      if email.contains('\0') {                                       │   │
│  │          return Err(ValidationError::NullByte);                     │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // No CRLF (header injection)                                  │   │
│  │      if email.contains('\r') || email.contains('\n') {              │   │
│  │          return Err(ValidationError::HeaderInjection);              │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Template Name Validation:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_template_name(name: &str) -> Result<(), ValidationErr> │   │
│  │  {                                                                   │   │
│  │      // Non-empty                                                   │   │
│  │      if name.is_empty() {                                            │   │
│  │          return Err(ValidationError::EmptyName);                    │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Max length                                                  │   │
│  │      if name.len() > 64 {                                           │   │
│  │          return Err(ValidationError::NameTooLong);                  │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Alphanumeric, hyphen, underscore only                       │   │
│  │      if !name.chars().all(|c|                                       │   │
│  │          c.is_ascii_alphanumeric() || c == '-' || c == '_') {       │   │
│  │          return Err(ValidationError::InvalidCharacters);            │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Header Value Validation:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_header_value(value: &str) -> Result<(), ValidationErr> │   │
│  │  {                                                                   │   │
│  │      // No CRLF injection                                           │   │
│  │      if value.contains('\r') || value.contains('\n') {              │   │
│  │          return Err(ValidationError::HeaderInjection);              │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Only visible ASCII + SP + HT                                │   │
│  │      if !value.bytes().all(|b|                                       │   │
│  │          b == b' ' || b == b'\t' || (b >= 0x21 && b <= 0x7E)) {     │   │
│  │          return Err(ValidationError::InvalidHeaderChars);           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL PROTECTION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SecretString Implementation:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  pub struct SecretString {                                           │   │
│  │      inner: String,                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl SecretString {                                                 │   │
│  │      pub fn new(value: String) -> Self {                            │   │
│  │          Self { inner: value }                                       │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn expose_secret(&self) -> &str {                          │   │
│  │          &self.inner                                                 │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Debug for SecretString {                                       │   │
│  │      fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {          │   │
│  │          write!(f, "[REDACTED]")                                     │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Display for SecretString {                                     │   │
│  │      fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {          │   │
│  │          write!(f, "[REDACTED]")                                     │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for SecretString {                                        │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          use zeroize::Zeroize;                                       │   │
│  │          self.inner.zeroize();                                       │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Prevent accidental serialization                                │   │
│  │  impl !Serialize for SecretString {}                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Credential Logging Protection:                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // NEVER log these fields                                          │   │
│  │  const SENSITIVE_FIELDS: &[&str] = &[                               │   │
│  │      "aws_access_key_id",                                            │   │
│  │      "aws_secret_access_key",                                        │   │
│  │      "aws_session_token",                                            │   │
│  │      "authorization",                                                │   │
│  │      "x-amz-security-token",                                         │   │
│  │  ];                                                                  │   │
│  │                                                                      │   │
│  │  fn sanitize_headers_for_logging(                                    │   │
│  │      headers: &HeaderMap                                             │   │
│  │  ) -> HashMap<String, String> {                                     │   │
│  │      headers                                                         │   │
│  │          .iter()                                                     │   │
│  │          .map(|(k, v)| {                                             │   │
│  │              let key = k.as_str().to_lowercase();                   │   │
│  │              let value = if SENSITIVE_FIELDS.contains(&key.as_str())│   │
│  │              {                                                       │   │
│  │                  "[REDACTED]".to_string()                           │   │
│  │              } else {                                                │   │
│  │                  v.to_str().unwrap_or("[BINARY]").to_string()       │   │
│  │              };                                                      │   │
│  │              (key, value)                                            │   │
│  │          })                                                          │   │
│  │          .collect()                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Email Content Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EMAIL CONTENT PROTECTION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Content Logging Strategy:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Log metadata only, never content                                │   │
│  │  fn log_email_sent(request: &SendEmailRequest, result: &SendResult) │   │
│  │  {                                                                   │   │
│  │      info!(                                                          │   │
│  │          message_id = %result.message_id,                           │   │
│  │          from = truncate_email(&request.from_email_address),        │   │
│  │          to_count = request.destination.to_addresses.len(),         │   │
│  │          cc_count = request.destination.cc_addresses.len(),         │   │
│  │          bcc_count = request.destination.bcc_addresses.len(),       │   │
│  │          config_set = request.configuration_set_name.as_deref(),    │   │
│  │          has_html = request.content.has_html(),                     │   │
│  │          has_text = request.content.has_text(),                     │   │
│  │          "Email sent successfully"                                   │   │
│  │      );                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn truncate_email(email: &str) -> String {                         │   │
│  │      // Only show first 3 chars + domain                            │   │
│  │      if let Some(at_pos) = email.find('@') {                        │   │
│  │          let local = &email[..at_pos.min(3)];                       │   │
│  │          let domain = &email[at_pos..];                             │   │
│  │          format!("{}...{}", local, domain)                          │   │
│  │      } else {                                                        │   │
│  │          "[INVALID]".to_string()                                    │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Template Data Protection:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Template data may contain PII - never log                       │   │
│  │  fn log_template_send(request: &SendEmailRequest) {                 │   │
│  │      if let EmailContent::Template { template_name, .. } =          │   │
│  │          &request.content                                            │   │
│  │      {                                                               │   │
│  │          debug!(                                                     │   │
│  │              template_name = %template_name,                        │   │
│  │              // template_data intentionally NOT logged              │   │
│  │              "Sending templated email"                              │   │
│  │          );                                                          │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. API Refinements

### 5.1 Error Handling Improvements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING IMPROVEMENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Rich Error Context:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Include actionable information in errors                        │   │
│  │  pub enum SesError {                                                 │   │
│  │      // Email errors with context                                   │   │
│  │      MessageRejected {                                               │   │
│  │          reason: String,                                             │   │
│  │          request_id: String,                                         │   │
│  │          suggestion: Option<String>,                                 │   │
│  │      },                                                              │   │
│  │                                                                      │   │
│  │      // Identity errors with fix guidance                           │   │
│  │      IdentityNotVerified {                                           │   │
│  │          identity: String,                                           │   │
│  │          verification_status: String,                                │   │
│  │          how_to_verify: String,                                      │   │
│  │      },                                                              │   │
│  │                                                                      │   │
│  │      // Quota errors with current usage                             │   │
│  │      QuotaExceeded {                                                 │   │
│  │          quota_type: QuotaType,                                      │   │
│  │          current: u64,                                               │   │
│  │          limit: u64,                                                 │   │
│  │          reset_at: Option<DateTime<Utc>>,                           │   │
│  │      },                                                              │   │
│  │                                                                      │   │
│  │      // Template errors with missing variables                      │   │
│  │      TemplateRenderError {                                           │   │
│  │          template_name: String,                                      │   │
│  │          missing_variables: Vec<String>,                            │   │
│  │          provided_variables: Vec<String>,                           │   │
│  │      },                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl SesError {                                                     │   │
│  │      pub fn suggestion(&self) -> Option<&str> {                     │   │
│  │          // Return actionable fix suggestion                        │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn is_retryable(&self) -> bool {                           │   │
│  │          matches!(self,                                              │   │
│  │              SesError::Throttling { .. } |                          │   │
│  │              SesError::ServiceUnavailable { .. } |                  │   │
│  │              SesError::ConnectionError { .. }                       │   │
│  │          )                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn retry_after(&self) -> Option<Duration> {                │   │
│  │          // Return suggested retry delay                            │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Builder Pattern Refinements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BUILDER PATTERN REFINEMENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Fluent Email Builder:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Ergonomic builder for common use cases                          │   │
│  │  let request = SendEmailRequest::builder()                          │   │
│  │      .from("sender@example.com")                                    │   │
│  │      .to("recipient@example.com")                                   │   │
│  │      .to("another@example.com")  // Chain multiple recipients       │   │
│  │      .cc("cc@example.com")                                          │   │
│  │      .subject("Hello!")                                             │   │
│  │      .text("Plain text body")                                       │   │
│  │      .html("<html><body>HTML body</body></html>")                   │   │
│  │      .reply_to("reply@example.com")                                 │   │
│  │      .configuration_set("transactional")                            │   │
│  │      .tag("campaign", "welcome")                                    │   │
│  │      .build()?;                                                     │   │
│  │                                                                      │   │
│  │  // Template builder                                                │   │
│  │  let request = SendEmailRequest::builder()                          │   │
│  │      .from("sender@example.com")                                    │   │
│  │      .to("recipient@example.com")                                   │   │
│  │      .template("welcome-email")                                     │   │
│  │      .template_data(json!({                                         │   │
│  │          "name": "John",                                            │   │
│  │          "code": "ABC123"                                           │   │
│  │      }))                                                            │   │
│  │      .build()?;                                                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Type-Safe Configuration Builder:                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Compile-time validation of required fields                      │   │
│  │  let client = SesClient::builder()                                  │   │
│  │      .region("us-east-1")       // Required                         │   │
│  │      .with_retry(RetryConfig::default())                            │   │
│  │      .with_circuit_breaker(CircuitBreakerConfig::default())         │   │
│  │      .with_rate_limit(RateLimitConfig::new(14.0))  // 14 req/sec    │   │
│  │      .with_timeout(Duration::from_secs(30))                         │   │
│  │      .with_tracing(true)                                            │   │
│  │      .build()?;                                                     │   │
│  │                                                                      │   │
│  │  // TypeState pattern for required fields                           │   │
│  │  struct SesClientBuilder<R> {                                       │   │
│  │      region: R,                                                      │   │
│  │      // ...                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl SesClientBuilder<NoRegion> {                                  │   │
│  │      fn region(self, region: &str) -> SesClientBuilder<HasRegion>;  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl SesClientBuilder<HasRegion> {                                 │   │
│  │      fn build(self) -> Result<SesClient, SesError>;                 │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Testing Refinements

### 6.1 Mock Improvements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MOCK IMPROVEMENTS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request Matchers:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Flexible request matching for tests                             │   │
│  │  let mock = MockSesTransport::new()                                 │   │
│  │      .expect_send_email()                                           │   │
│  │      .with_from("sender@example.com")                               │   │
│  │      .with_to_containing("@example.com")                            │   │
│  │      .with_subject_matching(r"Order #\d+")                          │   │
│  │      .times(1)                                                       │   │
│  │      .returning(|_| Ok(send_email_response("msg-123")));            │   │
│  │                                                                      │   │
│  │  // Verify all expectations                                         │   │
│  │  mock.verify();                                                      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Error Simulation:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Simulate various error conditions                               │   │
│  │  let mock = MockSesTransport::new()                                 │   │
│  │      .on_first_call()                                                │   │
│  │      .return_error(SesError::Throttling { retry_after: 1.0 })       │   │
│  │      .on_second_call()                                               │   │
│  │      .return_success(send_email_response("msg-123"));               │   │
│  │                                                                      │   │
│  │  // Test retry behavior                                             │   │
│  │  let result = client.emails().send(request).await;                  │   │
│  │  assert!(result.is_ok());                                            │   │
│  │  assert_eq!(mock.call_count(), 2);                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Bulk Email Testing:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Test partial bulk send failures                                 │   │
│  │  let mock = MockSesTransport::new()                                 │   │
│  │      .expect_send_bulk_email()                                      │   │
│  │      .returning(|entries| {                                         │   │
│  │          Ok(SendBulkEmailOutput {                                   │   │
│  │              bulk_email_entry_results: entries.iter()               │   │
│  │                  .enumerate()                                       │   │
│  │                  .map(|(i, _)| {                                    │   │
│  │                      if i == 2 {                                    │   │
│  │                          // Fail third entry                        │   │
│  │                          BulkEmailEntryResult::failed("rejected")   │   │
│  │                      } else {                                        │   │
│  │                          BulkEmailEntryResult::success()            │   │
│  │                      }                                               │   │
│  │                  })                                                  │   │
│  │                  .collect()                                         │   │
│  │          })                                                          │   │
│  │      });                                                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Integration Test Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   INTEGRATION TEST PATTERNS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LocalStack Integration:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  #[tokio::test]                                                      │   │
│  │  async fn test_send_email_localstack() {                            │   │
│  │      // Skip if LocalStack not available                            │   │
│  │      if !localstack_available().await {                             │   │
│  │          return;                                                     │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      let client = SesClient::builder()                              │   │
│  │          .region("us-east-1")                                       │   │
│  │          .endpoint("http://localhost:4566")                         │   │
│  │          .credentials(static_credentials("test", "test"))           │   │
│  │          .verify_ssl(false)                                         │   │
│  │          .build()                                                    │   │
│  │          .unwrap();                                                  │   │
│  │                                                                      │   │
│  │      // Create identity first                                       │   │
│  │      client.identities()                                            │   │
│  │          .create(CreateIdentityRequest {                            │   │
│  │              identity: "test@example.com".into(),                   │   │
│  │              ..Default::default()                                   │   │
│  │          })                                                          │   │
│  │          .await                                                      │   │
│  │          .unwrap();                                                  │   │
│  │                                                                      │   │
│  │      // Send email                                                   │   │
│  │      let result = client.emails()                                   │   │
│  │          .send(SendEmailRequest::builder()                          │   │
│  │              .from("test@example.com")                              │   │
│  │              .to("recipient@example.com")                           │   │
│  │              .subject("Test")                                       │   │
│  │              .text("Test body")                                     │   │
│  │              .build()                                                │   │
│  │              .unwrap())                                             │   │
│  │          .await;                                                     │   │
│  │                                                                      │   │
│  │      assert!(result.is_ok());                                        │   │
│  │      assert!(!result.unwrap().message_id.is_empty());               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Test Fixtures:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Reusable test fixtures                                          │   │
│  │  mod fixtures {                                                      │   │
│  │      pub fn simple_email_request() -> SendEmailRequest {            │   │
│  │          SendEmailRequest::builder()                                │   │
│  │              .from("sender@example.com")                            │   │
│  │              .to("recipient@example.com")                           │   │
│  │              .subject("Test Subject")                               │   │
│  │              .text("Test body")                                     │   │
│  │              .build()                                                │   │
│  │              .unwrap()                                               │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn template_request(name: &str) -> CreateTemplateRequest { │   │
│  │          CreateTemplateRequest {                                    │   │
│  │              template_name: name.to_string(),                       │   │
│  │              subject: "Hello {{name}}".to_string(),                 │   │
│  │              text: Some("Hi {{name}}".to_string()),                 │   │
│  │              html: Some("<h1>Hi {{name}}</h1>".to_string()),        │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn bulk_entries(count: usize) -> Vec<BulkEmailEntry> {     │   │
│  │          (0..count)                                                  │   │
│  │              .map(|i| BulkEmailEntry {                              │   │
│  │                  destination: Destination {                         │   │
│  │                      to_addresses: vec![format!("user{}@ex.com", i)],│  │
│  │                      ..Default::default()                           │   │
│  │                  },                                                  │   │
│  │                  replacement_template_data: Some(                   │   │
│  │                      json!({"name": format!("User {}", i)}).to_string()│ │
│  │                  ),                                                  │   │
│  │                  ..Default::default()                               │   │
│  │              })                                                      │   │
│  │              .collect()                                              │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Documentation Refinements

### 7.1 API Documentation Standards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   API DOCUMENTATION STANDARDS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Function Documentation Template:                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  /// Sends an email using Amazon SES v2.                            │   │
│  │  ///                                                                 │   │
│  │  /// # Arguments                                                    │   │
│  │  ///                                                                 │   │
│  │  /// * `request` - The email send request containing:               │   │
│  │  ///   - `from_email_address`: Verified sender address              │   │
│  │  ///   - `destination`: Recipients (to, cc, bcc)                    │   │
│  │  ///   - `content`: Email body (simple, raw, or template)           │   │
│  │  ///                                                                 │   │
│  │  /// # Returns                                                       │   │
│  │  ///                                                                 │   │
│  │  /// Returns `SendEmailOutput` with the message ID on success.      │   │
│  │  ///                                                                 │   │
│  │  /// # Errors                                                        │   │
│  │  ///                                                                 │   │
│  │  /// - `SesError::MessageRejected` - Content rejected by SES        │   │
│  │  /// - `SesError::IdentityNotVerified` - Sender not verified        │   │
│  │  /// - `SesError::QuotaExceeded` - Sending limit reached            │   │
│  │  /// - `SesError::Throttling` - Rate limited, retry with backoff    │   │
│  │  ///                                                                 │   │
│  │  /// # Examples                                                      │   │
│  │  ///                                                                 │   │
│  │  /// ```rust                                                         │   │
│  │  /// let result = client.emails()                                   │   │
│  │  ///     .send(SendEmailRequest::builder()                          │   │
│  │  ///         .from("sender@example.com")                            │   │
│  │  ///         .to("recipient@example.com")                           │   │
│  │  ///         .subject("Hello!")                                     │   │
│  │  ///         .text("Body text")                                     │   │
│  │  ///         .build()?)                                             │   │
│  │  ///     .await?;                                                   │   │
│  │  ///                                                                 │   │
│  │  /// println!("Sent with ID: {}", result.message_id);               │   │
│  │  /// ```                                                             │   │
│  │  ///                                                                 │   │
│  │  /// # Retries                                                       │   │
│  │  ///                                                                 │   │
│  │  /// This operation is automatically retried on transient failures  │   │
│  │  /// using exponential backoff. Throttling errors respect the       │   │
│  │  /// Retry-After header.                                            │   │
│  │  pub async fn send(                                                  │   │
│  │      &self,                                                          │   │
│  │      request: SendEmailRequest,                                     │   │
│  │  ) -> Result<SendEmailOutput, SesError>;                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Checklist Summary

### Pre-Implementation Checklist

- [x] Specification fully covered
- [x] Architecture principles followed
- [x] Security requirements met
- [x] Edge cases documented
- [x] Performance optimizations identified
- [x] Input validation defined
- [x] Error handling comprehensive
- [x] Testing patterns established
- [x] API ergonomics refined
- [x] Documentation standards set

### Key Refinements Made

1. **Email Address Handling**: Lenient validation with proper encoding
2. **Template Variables**: Clear behavior for missing/extra variables
3. **Credential Management**: Expiration handling and single-flight refresh
4. **Rate Limiting**: Client-side limiting and sandbox detection
5. **Bulk Email**: Parallel batch processing with error aggregation
6. **Security**: Content protection, credential redaction
7. **Error Context**: Rich errors with actionable suggestions
8. **Builder Patterns**: Fluent API with type-safe configuration

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial refinement document |

---

**End of Refinement Phase**

*Proceed to Phase 5: Completion when ready.*
