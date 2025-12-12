//! Pagination handling for Google Drive API.
//!
//! This module provides utilities for handling cursor-based pagination using
//! `nextPageToken` from Google Drive API responses.

use crate::errors::{GoogleDriveError, GoogleDriveResult};
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::marker::PhantomData;
use std::pin::Pin;
use std::task::{Context, Poll};

/// A page of results from Google Drive API.
#[derive(Debug, Clone)]
pub struct Page<T> {
    /// The items in this page.
    pub items: Vec<T>,
    /// Token for the next page (cursor-based pagination).
    pub next_page_token: Option<String>,
    /// Indicates if the search was incomplete (for file lists).
    pub incomplete_search: bool,
}

impl<T> Page<T> {
    /// Creates a new page.
    pub fn new(items: Vec<T>, next_page_token: Option<String>) -> Self {
        Self {
            items,
            next_page_token,
            incomplete_search: false,
        }
    }

    /// Creates a new page with incomplete search flag.
    pub fn with_incomplete_search(mut self, incomplete: bool) -> Self {
        self.incomplete_search = incomplete;
        self
    }

    /// Returns true if there is a next page.
    pub fn has_next(&self) -> bool {
        self.next_page_token.is_some()
    }

    /// Returns the number of items in this page.
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Returns true if this page is empty.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Maps the items in this page to a different type.
    pub fn map<U, F>(self, f: F) -> Page<U>
    where
        F: FnMut(T) -> U,
    {
        Page {
            items: self.items.into_iter().map(f).collect(),
            next_page_token: self.next_page_token,
            incomplete_search: self.incomplete_search,
        }
    }
}

/// Pagination parameters for API requests.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PaginationParams {
    /// Number of items per page.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<u32>,
    /// Page token for continuation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
    /// Sort order (e.g., "modifiedTime desc").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_by: Option<String>,
}

impl PaginationParams {
    /// Creates new pagination parameters.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets the page size.
    pub fn with_page_size(mut self, size: u32) -> Self {
        self.page_size = Some(size);
        self
    }

    /// Sets the page token.
    pub fn with_page_token(mut self, token: impl Into<String>) -> Self {
        self.page_token = Some(token.into());
        self
    }

    /// Sets the sort order.
    pub fn with_order_by(mut self, order: impl Into<String>) -> Self {
        self.order_by = Some(order.into());
        self
    }
}

/// Iterator over all pages.
///
/// This iterator automatically fetches pages as needed and yields complete pages.
pub struct PageIterator<T, F, Fut>
where
    F: FnMut(Option<String>) -> Fut,
    Fut: std::future::Future<Output = GoogleDriveResult<Page<T>>>,
{
    fetch_fn: F,
    next_token: Option<String>,
    done: bool,
    _marker: PhantomData<T>,
}

impl<T, F, Fut> PageIterator<T, F, Fut>
where
    F: FnMut(Option<String>) -> Fut,
    Fut: std::future::Future<Output = GoogleDriveResult<Page<T>>>,
{
    /// Creates a new page iterator.
    pub fn new(fetch_fn: F) -> Self {
        Self {
            fetch_fn,
            next_token: None,
            done: false,
            _marker: PhantomData,
        }
    }

    /// Fetches the next page of results.
    pub async fn next_page(&mut self) -> GoogleDriveResult<Option<Page<T>>> {
        if self.done {
            return Ok(None);
        }

        let page = (self.fetch_fn)(self.next_token.clone()).await?;

        if let Some(next_token) = &page.next_page_token {
            self.next_token = Some(next_token.clone());
        } else {
            self.done = true;
        }

        Ok(Some(page))
    }

    /// Collects all remaining items from all pages.
    pub async fn collect_all(&mut self) -> GoogleDriveResult<Vec<T>> {
        let mut all_items = Vec::new();

        while let Some(page) = self.next_page().await? {
            all_items.extend(page.items);
        }

        Ok(all_items)
    }

    /// Returns true if there are more pages to fetch.
    pub fn has_next(&self) -> bool {
        !self.done
    }
}

/// Streaming iterator over individual items across all pages.
///
/// This iterator automatically fetches pages as needed and yields individual items.
pub struct StreamingIterator<T, F, Fut>
where
    F: FnMut(Option<String>) -> Fut + Unpin,
    Fut: std::future::Future<Output = GoogleDriveResult<Page<T>>> + Unpin,
{
    page_iterator: PageIterator<T, F, Fut>,
    current_page: Vec<T>,
    current_index: usize,
}

impl<T, F, Fut> StreamingIterator<T, F, Fut>
where
    F: FnMut(Option<String>) -> Fut + Unpin,
    Fut: std::future::Future<Output = GoogleDriveResult<Page<T>>> + Unpin,
{
    /// Creates a new streaming iterator.
    pub fn new(fetch_fn: F) -> Self {
        Self {
            page_iterator: PageIterator::new(fetch_fn),
            current_page: Vec::new(),
            current_index: 0,
        }
    }

    /// Fetches the next item.
    pub async fn next(&mut self) -> GoogleDriveResult<Option<T>> {
        // Check if we have items in current page
        if self.current_index < self.current_page.len() {
            let item = self.current_page.remove(0);
            return Ok(Some(item));
        }

        // Need to fetch next page
        match self.page_iterator.next_page().await? {
            Some(page) => {
                if page.items.is_empty() {
                    // Empty page, try next
                    return self.next().await;
                }
                self.current_page = page.items;
                self.current_index = 0;
                let item = self.current_page.remove(0);
                Ok(Some(item))
            }
            None => Ok(None),
        }
    }
}

/// Implementation of `Stream` trait for `StreamingIterator`.
impl<T, F, Fut> Stream for StreamingIterator<T, F, Fut>
where
    T: Unpin,
    F: FnMut(Option<String>) -> Fut + Unpin,
    Fut: std::future::Future<Output = GoogleDriveResult<Page<T>>> + Unpin,
{
    type Item = GoogleDriveResult<T>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // Check if we have items in current page
        if self.current_index < self.current_page.len() {
            let item = self.current_page.remove(0);
            return Poll::Ready(Some(Ok(item)));
        }

        // Need to fetch next page
        let next_page_fut = self.page_iterator.next_page();
        futures::pin_mut!(next_page_fut);

        match next_page_fut.poll(cx) {
            Poll::Ready(Ok(Some(page))) => {
                if page.items.is_empty() {
                    // Empty page, wake to try next
                    cx.waker().wake_by_ref();
                    Poll::Pending
                } else {
                    self.current_page = page.items;
                    self.current_index = 0;
                    let item = self.current_page.remove(0);
                    Poll::Ready(Some(Ok(item)))
                }
            }
            Poll::Ready(Ok(None)) => Poll::Ready(None),
            Poll::Ready(Err(e)) => Poll::Ready(Some(Err(e))),
            Poll::Pending => Poll::Pending,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_page_creation() {
        let page = Page::new(vec![1, 2, 3], Some("token".to_string()));
        assert_eq!(page.len(), 3);
        assert!(page.has_next());
        assert!(!page.is_empty());
    }

    #[test]
    fn test_page_map() {
        let page = Page::new(vec![1, 2, 3], Some("token".to_string()));
        let mapped = page.map(|x| x * 2);
        assert_eq!(mapped.items, vec![2, 4, 6]);
        assert_eq!(mapped.next_page_token, Some("token".to_string()));
    }

    #[test]
    fn test_pagination_params() {
        let params = PaginationParams::new()
            .with_page_size(100)
            .with_page_token("abc123")
            .with_order_by("modifiedTime desc");

        assert_eq!(params.page_size, Some(100));
        assert_eq!(params.page_token, Some("abc123".to_string()));
        assert_eq!(params.order_by, Some("modifiedTime desc".to_string()));
    }

    #[tokio::test]
    async fn test_page_iterator() {
        let pages = vec![
            Page::new(vec![1, 2, 3], Some("token1".to_string())),
            Page::new(vec![4, 5, 6], Some("token2".to_string())),
            Page::new(vec![7, 8, 9], None),
        ];
        let pages_clone = pages.clone();
        let mut index = 0;

        let fetch_fn = move |token: Option<String>| {
            let pages = pages_clone.clone();
            async move {
                let page = pages[index].clone();
                index += 1;
                Ok(page)
            }
        };

        let mut iterator = PageIterator::new(fetch_fn);

        let all_items = iterator.collect_all().await.unwrap();
        assert_eq!(all_items, vec![1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
}
