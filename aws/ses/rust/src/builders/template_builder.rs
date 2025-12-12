//! Template builder for creating email templates.

use crate::builders::BuilderError;
use serde::{Deserialize, Serialize};

/// Request to create an email template in AWS SES v2.
///
/// This request is constructed using [`TemplateBuilder`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CreateEmailTemplateRequest {
    /// Template name (unique identifier).
    pub template_name: String,
    /// Template content.
    pub template_content: TemplateContent,
}

/// Content for an email template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct TemplateContent {
    /// Subject line template.
    pub subject: String,
    /// Plain text body template.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// HTML body template.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
}

/// Builder for constructing [`CreateEmailTemplateRequest`] with a fluent API.
///
/// This builder provides methods for creating email templates with subject,
/// text, and HTML content. Templates can include placeholders using `{{variable}}`
/// syntax that will be replaced with actual values when sending emails.
///
/// # Examples
///
/// ## Simple text template
///
/// ```rust
/// use integrations_aws_ses::builders::TemplateBuilder;
///
/// let request = TemplateBuilder::new()
///     .name("welcome-email")
///     .subject("Welcome {{name}}!")
///     .text("Hello {{name}}, welcome to our service!")
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## HTML template with fallback text
///
/// ```rust
/// use integrations_aws_ses::builders::TemplateBuilder;
///
/// let request = TemplateBuilder::new()
///     .name("newsletter")
///     .subject("{{month}} Newsletter")
///     .html(r#"
///         <h1>{{month}} Newsletter</h1>
///         <p>Hello {{firstName}},</p>
///         <p>{{content}}</p>
///     "#)
///     .text("{{month}} Newsletter\n\nHello {{firstName}},\n\n{{content}}")
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Transactional email template
///
/// ```rust
/// use integrations_aws_ses::builders::TemplateBuilder;
///
/// let request = TemplateBuilder::new()
///     .name("order-confirmation")
///     .subject("Order Confirmation - #{{orderId}}")
///     .html(r#"
///         <h2>Thank you for your order!</h2>
///         <p>Order ID: {{orderId}}</p>
///         <p>Total: ${{totalAmount}}</p>
///         <p>Estimated delivery: {{deliveryDate}}</p>
///     "#)
///     .text(
///         "Thank you for your order!\n\
///          Order ID: {{orderId}}\n\
///          Total: ${{totalAmount}}\n\
///          Estimated delivery: {{deliveryDate}}"
///     )
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
///
/// ## Password reset template
///
/// ```rust
/// use integrations_aws_ses::builders::TemplateBuilder;
///
/// let request = TemplateBuilder::new()
///     .name("password-reset")
///     .subject("Reset your password")
///     .html(r#"
///         <p>Hi {{username}},</p>
///         <p>Click the link below to reset your password:</p>
///         <p><a href="{{resetLink}}">Reset Password</a></p>
///         <p>This link expires in {{expiryMinutes}} minutes.</p>
///     "#)
///     .text(
///         "Hi {{username}},\n\n\
///          Click the link below to reset your password:\n\
///          {{resetLink}}\n\n\
///          This link expires in {{expiryMinutes}} minutes."
///     )
///     .build()?;
/// # Ok::<(), integrations_aws_ses::builders::BuilderError>(())
/// ```
#[derive(Debug, Default)]
pub struct TemplateBuilder {
    name: Option<String>,
    subject: Option<String>,
    text: Option<String>,
    html: Option<String>,
}

impl TemplateBuilder {
    /// Create a new template builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the template name.
    ///
    /// This is a required field. The name must be unique within your AWS account.
    /// Template names can contain letters, numbers, underscores, and hyphens.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::TemplateBuilder;
    ///
    /// let builder = TemplateBuilder::new()
    ///     .name("welcome-email");
    /// ```
    pub fn name(mut self, template_name: impl Into<String>) -> Self {
        self.name = Some(template_name.into());
        self
    }

    /// Set the subject line template.
    ///
    /// This is a required field. The subject can include template variables
    /// using `{{variable}}` syntax.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::TemplateBuilder;
    ///
    /// let builder = TemplateBuilder::new()
    ///     .subject("Welcome {{firstName}} {{lastName}}!");
    /// ```
    pub fn subject(mut self, subject_line: impl Into<String>) -> Self {
        self.subject = Some(subject_line.into());
        self
    }

    /// Set the plain text body template.
    ///
    /// At least one of `text()` or `html()` must be set. The text body should
    /// provide a fallback for email clients that don't support HTML.
    ///
    /// Template variables are specified using `{{variable}}` syntax.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::TemplateBuilder;
    ///
    /// let builder = TemplateBuilder::new()
    ///     .text("Hello {{name}},\n\nWelcome to {{serviceName}}!");
    /// ```
    pub fn text(mut self, template: impl Into<String>) -> Self {
        self.text = Some(template.into());
        self
    }

    /// Set the HTML body template.
    ///
    /// At least one of `text()` or `html()` must be set. The HTML body provides
    /// rich formatting for email clients that support it.
    ///
    /// Template variables are specified using `{{variable}}` syntax.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use integrations_aws_ses::builders::TemplateBuilder;
    ///
    /// let builder = TemplateBuilder::new()
    ///     .html(r#"
    ///         <h1>Welcome {{name}}!</h1>
    ///         <p>Thanks for joining <strong>{{serviceName}}</strong>.</p>
    ///     "#);
    /// ```
    pub fn html(mut self, template: impl Into<String>) -> Self {
        self.html = Some(template.into());
        self
    }

    /// Build the [`CreateEmailTemplateRequest`].
    ///
    /// Returns an error if required fields are missing or invalid.
    ///
    /// # Errors
    ///
    /// - [`BuilderError::MissingField`] if `name` is not set
    /// - [`BuilderError::MissingField`] if `subject` is not set
    /// - [`BuilderError::MissingField`] if neither `text` nor `html` is set
    /// - [`BuilderError::InvalidValue`] if `name` is empty
    /// - [`BuilderError::InvalidValue`] if `subject` is empty
    pub fn build(self) -> Result<CreateEmailTemplateRequest, BuilderError> {
        // Validate required fields
        let template_name = self
            .name
            .ok_or_else(|| BuilderError::missing_field("name"))?;

        if template_name.trim().is_empty() {
            return Err(BuilderError::invalid_value(
                "name",
                "Template name cannot be empty",
            ));
        }

        let subject = self
            .subject
            .ok_or_else(|| BuilderError::missing_field("subject"))?;

        if subject.trim().is_empty() {
            return Err(BuilderError::invalid_value(
                "subject",
                "Subject cannot be empty",
            ));
        }

        // At least one of text or HTML must be present
        if self.text.is_none() && self.html.is_none() {
            return Err(BuilderError::missing_field("body (text or html)"));
        }

        // Validate that text body is not empty if provided
        if let Some(ref text) = self.text {
            if text.trim().is_empty() {
                return Err(BuilderError::invalid_value(
                    "text",
                    "Text body cannot be empty",
                ));
            }
        }

        // Validate that HTML body is not empty if provided
        if let Some(ref html) = self.html {
            if html.trim().is_empty() {
                return Err(BuilderError::invalid_value(
                    "html",
                    "HTML body cannot be empty",
                ));
            }
        }

        Ok(CreateEmailTemplateRequest {
            template_name,
            template_content: TemplateContent {
                subject,
                text: self.text,
                html: self.html,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_template() {
        let request = TemplateBuilder::new()
            .name("test-template")
            .subject("Test Subject {{name}}")
            .text("Hello {{name}}")
            .build()
            .unwrap();

        assert_eq!(request.template_name, "test-template");
        assert_eq!(request.template_content.subject, "Test Subject {{name}}");
        assert_eq!(
            request.template_content.text,
            Some("Hello {{name}}".to_string())
        );
        assert!(request.template_content.html.is_none());
    }

    #[test]
    fn test_html_template() {
        let request = TemplateBuilder::new()
            .name("html-template")
            .subject("HTML Test")
            .html("<p>Hello {{name}}</p>")
            .build()
            .unwrap();

        assert_eq!(request.template_name, "html-template");
        assert!(request.template_content.text.is_none());
        assert_eq!(
            request.template_content.html,
            Some("<p>Hello {{name}}</p>".to_string())
        );
    }

    #[test]
    fn test_multipart_template() {
        let request = TemplateBuilder::new()
            .name("multipart-template")
            .subject("Multipart Test")
            .text("Plain text {{var}}")
            .html("<p>HTML {{var}}</p>")
            .build()
            .unwrap();

        assert!(request.template_content.text.is_some());
        assert!(request.template_content.html.is_some());
    }

    #[test]
    fn test_missing_name() {
        let result = TemplateBuilder::new()
            .subject("Test")
            .text("Body")
            .build();

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), BuilderError::missing_field("name"));
    }

    #[test]
    fn test_empty_name() {
        let result = TemplateBuilder::new()
            .name("   ")
            .subject("Test")
            .text("Body")
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            BuilderError::InvalidValue { field, .. } => assert_eq!(field, "name"),
            _ => panic!("Expected InvalidValue error"),
        }
    }

    #[test]
    fn test_missing_subject() {
        let result = TemplateBuilder::new()
            .name("test")
            .text("Body")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("subject")
        );
    }

    #[test]
    fn test_empty_subject() {
        let result = TemplateBuilder::new()
            .name("test")
            .subject("  ")
            .text("Body")
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            BuilderError::InvalidValue { field, .. } => assert_eq!(field, "subject"),
            _ => panic!("Expected InvalidValue error"),
        }
    }

    #[test]
    fn test_missing_body() {
        let result = TemplateBuilder::new()
            .name("test")
            .subject("Test")
            .build();

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            BuilderError::missing_field("body (text or html)")
        );
    }

    #[test]
    fn test_empty_text_body() {
        let result = TemplateBuilder::new()
            .name("test")
            .subject("Test")
            .text("   ")
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            BuilderError::InvalidValue { field, .. } => assert_eq!(field, "text"),
            _ => panic!("Expected InvalidValue error"),
        }
    }

    #[test]
    fn test_empty_html_body() {
        let result = TemplateBuilder::new()
            .name("test")
            .subject("Test")
            .html("  ")
            .build();

        assert!(result.is_err());
        match result.unwrap_err() {
            BuilderError::InvalidValue { field, .. } => assert_eq!(field, "html"),
            _ => panic!("Expected InvalidValue error"),
        }
    }

    #[test]
    fn test_template_with_variables() {
        let request = TemplateBuilder::new()
            .name("welcome-email")
            .subject("Welcome {{firstName}} {{lastName}}!")
            .html(
                r#"
                <h1>Welcome {{firstName}}!</h1>
                <p>Your account ID is {{accountId}}</p>
            "#,
            )
            .text("Welcome {{firstName}}!\nYour account ID is {{accountId}}")
            .build()
            .unwrap();

        assert!(request.template_content.subject.contains("{{firstName}}"));
        assert!(request.template_content.subject.contains("{{lastName}}"));
        assert!(request
            .template_content
            .html
            .as_ref()
            .unwrap()
            .contains("{{accountId}}"));
        assert!(request
            .template_content
            .text
            .as_ref()
            .unwrap()
            .contains("{{accountId}}"));
    }

    #[test]
    fn test_complex_template() {
        let request = TemplateBuilder::new()
            .name("order-confirmation")
            .subject("Order #{{orderId}} Confirmed")
            .html(
                r#"
                <div>
                    <h2>Thank you for your order!</h2>
                    <p>Order ID: {{orderId}}</p>
                    <p>Total: ${{total}}</p>
                    <ul>
                        {{#items}}
                        <li>{{name}} - ${{price}}</li>
                        {{/items}}
                    </ul>
                </div>
            "#,
            )
            .text(
                "Thank you for your order!\n\
                 Order ID: {{orderId}}\n\
                 Total: ${{total}}",
            )
            .build()
            .unwrap();

        assert_eq!(request.template_name, "order-confirmation");
    }
}
