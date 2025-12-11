//! Pagination handling for GitHub API.

use crate::errors::{GitHubError, GitHubErrorKind, GitHubResult};
use reqwest::header::HeaderMap;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::HashMap;

/// Pagination links parsed from Link header.
#[derive(Debug, Clone, Default)]
pub struct PaginationLinks {
    /// URL for the next page.
    pub next: Option<String>,
    /// URL for the previous page.
    pub prev: Option<String>,
    /// URL for the first page.
    pub first: Option<String>,
    /// URL for the last page.
    pub last: Option<String>,
}

impl PaginationLinks {
    /// Parses pagination links from the Link header (RFC 8288).
    pub fn from_header(header_value: &str) -> Self {
        let mut links = Self::default();

        for part in header_value.split(',') {
            let mut url = None;
            let mut rel = None;

            for segment in part.split(';') {
                let segment = segment.trim();
                if segment.starts_with('<') && segment.ends_with('>') {
                    url = Some(segment[1..segment.len() - 1].to_string());
                } else if segment.starts_with("rel=") {
                    let value = segment[4..].trim_matches('"');
                    rel = Some(value.to_string());
                }
            }

            if let (Some(url), Some(rel)) = (url, rel) {
                match rel.as_str() {
                    "next" => links.next = Some(url),
                    "prev" => links.prev = Some(url),
                    "first" => links.first = Some(url),
                    "last" => links.last = Some(url),
                    _ => {}
                }
            }
        }

        links
    }

    /// Parses pagination links from response headers.
    pub fn from_headers(headers: &HeaderMap) -> Self {
        headers
            .get("link")
            .and_then(|v| v.to_str().ok())
            .map(Self::from_header)
            .unwrap_or_default()
    }

    /// Returns true if there is a next page.
    pub fn has_next(&self) -> bool {
        self.next.is_some()
    }

    /// Returns true if there is a previous page.
    pub fn has_prev(&self) -> bool {
        self.prev.is_some()
    }

    /// Gets the total page count from the last link.
    pub fn total_pages(&self) -> Option<u32> {
        self.last.as_ref().and_then(|url| {
            url::Url::parse(url)
                .ok()
                .and_then(|u| {
                    u.query_pairs()
                        .find(|(k, _)| k == "page")
                        .and_then(|(_, v)| v.parse().ok())
                })
        })
    }
}

/// A single page of results.
#[derive(Debug, Clone)]
pub struct Page<T> {
    /// The items in this page.
    pub items: Vec<T>,
    /// Pagination links.
    pub links: PaginationLinks,
    /// Current page number (if known).
    pub page: Option<u32>,
    /// Items per page.
    pub per_page: Option<u32>,
    /// Total count (if provided by API).
    pub total_count: Option<u64>,
}

impl<T> Page<T> {
    /// Creates a new page.
    pub fn new(items: Vec<T>, links: PaginationLinks) -> Self {
        Self {
            items,
            links,
            page: None,
            per_page: None,
            total_count: None,
        }
    }

    /// Sets the page number.
    pub fn with_page(mut self, page: u32) -> Self {
        self.page = Some(page);
        self
    }

    /// Sets items per page.
    pub fn with_per_page(mut self, per_page: u32) -> Self {
        self.per_page = Some(per_page);
        self
    }

    /// Sets total count.
    pub fn with_total_count(mut self, count: u64) -> Self {
        self.total_count = Some(count);
        self
    }

    /// Returns true if there is a next page.
    pub fn has_next(&self) -> bool {
        self.links.has_next()
    }

    /// Returns the URL for the next page.
    pub fn next_url(&self) -> Option<&str> {
        self.links.next.as_deref()
    }

    /// Returns the number of items in this page.
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Returns true if the page is empty.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Consumes the page and returns the items.
    pub fn into_items(self) -> Vec<T> {
        self.items
    }

    /// Maps the items in this page.
    pub fn map<U, F>(self, f: F) -> Page<U>
    where
        F: FnMut(T) -> U,
    {
        Page {
            items: self.items.into_iter().map(f).collect(),
            links: self.links,
            page: self.page,
            per_page: self.per_page,
            total_count: self.total_count,
        }
    }
}

impl<T> IntoIterator for Page<T> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        self.items.into_iter()
    }
}

/// Pagination parameters for list requests.
#[derive(Debug, Clone, Default, Serialize)]
pub struct PaginationParams {
    /// Page number (1-indexed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// Items per page (max 100).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_page: Option<u32>,
}

impl PaginationParams {
    /// Creates new pagination parameters.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the page number.
    pub fn page(mut self, page: u32) -> Self {
        self.page = Some(page);
        self
    }

    /// Sets items per page.
    pub fn per_page(mut self, per_page: u32) -> Self {
        // GitHub API limits to 100
        self.per_page = Some(per_page.min(100));
        self
    }

    /// Converts to query parameters.
    pub fn to_query(&self) -> Vec<(String, String)> {
        let mut params = Vec::new();
        if let Some(page) = self.page {
            params.push(("page".to_string(), page.to_string()));
        }
        if let Some(per_page) = self.per_page {
            params.push(("per_page".to_string(), per_page.to_string()));
        }
        params
    }
}

/// Response wrapper for paginated lists with total count.
#[derive(Debug, Clone, Deserialize)]
pub struct ListResponse<T> {
    /// Total count of items.
    pub total_count: u64,
    /// Whether results are incomplete (for search).
    #[serde(default)]
    pub incomplete_results: bool,
    /// The items.
    pub items: Vec<T>,
}

/// Async iterator for paginating through all results.
pub struct PageIterator<T, F>
where
    F: Fn(Option<String>) -> futures::future::BoxFuture<'static, GitHubResult<Page<T>>>,
{
    /// Function to fetch the next page.
    fetch_fn: F,
    /// URL for the next page.
    next_url: Option<String>,
    /// Whether we've exhausted all pages.
    exhausted: bool,
    /// Phantom data for T.
    _phantom: std::marker::PhantomData<T>,
}

impl<T, F> PageIterator<T, F>
where
    F: Fn(Option<String>) -> futures::future::BoxFuture<'static, GitHubResult<Page<T>>>,
{
    /// Creates a new page iterator.
    pub fn new(fetch_fn: F) -> Self {
        Self {
            fetch_fn,
            next_url: None,
            exhausted: false,
            _phantom: std::marker::PhantomData,
        }
    }

    /// Creates a page iterator starting from a URL.
    pub fn from_url(fetch_fn: F, start_url: String) -> Self {
        Self {
            fetch_fn,
            next_url: Some(start_url),
            exhausted: false,
            _phantom: std::marker::PhantomData,
        }
    }

    /// Fetches the next page.
    pub async fn next_page(&mut self) -> GitHubResult<Option<Page<T>>> {
        if self.exhausted {
            return Ok(None);
        }

        let page = (self.fetch_fn)(self.next_url.take()).await?;

        if page.has_next() {
            self.next_url = page.links.next.clone();
        } else {
            self.exhausted = true;
        }

        Ok(Some(page))
    }

    /// Collects all items from all pages.
    pub async fn collect_all(mut self) -> GitHubResult<Vec<T>> {
        let mut all_items = Vec::new();

        while let Some(page) = self.next_page().await? {
            all_items.extend(page.into_items());
        }

        Ok(all_items)
    }

    /// Returns true if there are more pages.
    pub fn has_more(&self) -> bool {
        !self.exhausted
    }
}

/// Extracts page number from a URL.
pub fn extract_page_number(url: &str) -> Option<u32> {
    url::Url::parse(url)
        .ok()
        .and_then(|u| {
            u.query_pairs()
                .find(|(k, _)| k == "page")
                .and_then(|(_, v)| v.parse().ok())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_link_header() {
        let header = r#"<https://api.github.com/repos?page=2>; rel="next", <https://api.github.com/repos?page=5>; rel="last""#;
        let links = PaginationLinks::from_header(header);

        assert_eq!(links.next, Some("https://api.github.com/repos?page=2".to_string()));
        assert_eq!(links.last, Some("https://api.github.com/repos?page=5".to_string()));
        assert!(links.prev.is_none());
        assert!(links.first.is_none());
    }

    #[test]
    fn test_parse_full_link_header() {
        let header = r#"<https://api.github.com/repos?page=1>; rel="first", <https://api.github.com/repos?page=2>; rel="prev", <https://api.github.com/repos?page=4>; rel="next", <https://api.github.com/repos?page=5>; rel="last""#;
        let links = PaginationLinks::from_header(header);

        assert!(links.first.is_some());
        assert!(links.prev.is_some());
        assert!(links.next.is_some());
        assert!(links.last.is_some());
    }

    #[test]
    fn test_total_pages() {
        let header = r#"<https://api.github.com/repos?page=2>; rel="next", <https://api.github.com/repos?page=10>; rel="last""#;
        let links = PaginationLinks::from_header(header);

        assert_eq!(links.total_pages(), Some(10));
    }

    #[test]
    fn test_pagination_params() {
        let params = PaginationParams::new().page(2).per_page(50);
        let query = params.to_query();

        assert!(query.contains(&("page".to_string(), "2".to_string())));
        assert!(query.contains(&("per_page".to_string(), "50".to_string())));
    }

    #[test]
    fn test_per_page_limit() {
        let params = PaginationParams::new().per_page(200);
        assert_eq!(params.per_page, Some(100));
    }

    #[test]
    fn test_page_operations() {
        let page: Page<i32> = Page::new(vec![1, 2, 3], PaginationLinks::default())
            .with_page(1)
            .with_per_page(30)
            .with_total_count(100);

        assert_eq!(page.len(), 3);
        assert!(!page.is_empty());
        assert!(!page.has_next());
        assert_eq!(page.page, Some(1));
        assert_eq!(page.per_page, Some(30));
        assert_eq!(page.total_count, Some(100));
    }
}
