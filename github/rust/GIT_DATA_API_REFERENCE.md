# Git Data Service API Reference

Quick reference for all Git Data service operations.

## Service Access

```rust
let client = GitHubClient::builder().pat("token").build()?;
let git_data = client.git_data();
```

## Blob Operations

### Get Blob
```rust
async fn get_blob(&self, owner: &str, repo: &str, sha: &str) -> GitHubResult<Blob>
```

**Example:**
```rust
let blob = git_data.get_blob("octocat", "hello-world", "abc123").await?;
println!("Content: {}", blob.content.unwrap());
```

### Create Blob
```rust
async fn create_blob(&self, owner: &str, repo: &str, request: &CreateBlobRequest) -> GitHubResult<BlobReference>
```

**Example:**
```rust
let request = CreateBlobRequest {
    content: "Hello, World!".to_string(),
    encoding: BlobEncoding::Utf8,
};
let blob_ref = git_data.create_blob("owner", "repo", &request).await?;
```

## Tree Operations

### Get Tree
```rust
async fn get_tree(&self, owner: &str, repo: &str, sha: &str, recursive: bool) -> GitHubResult<Tree>
```

**Example:**
```rust
// Get tree recursively
let tree = git_data.get_tree("owner", "repo", "tree_sha", true).await?;
for entry in tree.tree {
    println!("{}: {} ({})", entry.path, entry.sha.unwrap(), entry.entry_type);
}
```

### Create Tree
```rust
async fn create_tree(&self, owner: &str, repo: &str, request: &CreateTreeRequest) -> GitHubResult<Tree>
```

**Example:**
```rust
let request = CreateTreeRequest {
    tree: vec![
        CreateTreeEntry {
            path: "src/main.rs".to_string(),
            mode: TreeMode::File,
            entry_type: TreeEntryType::Blob,
            sha: Some("blob_sha".to_string()),
            content: None,
        },
        CreateTreeEntry {
            path: "README.md".to_string(),
            mode: TreeMode::File,
            entry_type: TreeEntryType::Blob,
            sha: None,
            content: Some("# My Project".to_string()),
        },
    ],
    base_tree: Some("base_tree_sha".to_string()),
};
let tree = git_data.create_tree("owner", "repo", &request).await?;
```

## Commit Operations

### Get Commit
```rust
async fn get_commit(&self, owner: &str, repo: &str, sha: &str) -> GitHubResult<GitCommit>
```

**Example:**
```rust
let commit = git_data.get_commit("owner", "repo", "commit_sha").await?;
println!("Message: {}", commit.message);
println!("Author: {} <{}>", commit.author.name, commit.author.email);
```

### Create Commit
```rust
async fn create_commit(&self, owner: &str, repo: &str, request: &CreateCommitRequest) -> GitHubResult<GitCommit>
```

**Example:**
```rust
let request = CreateCommitRequest {
    message: "Add new feature".to_string(),
    tree: "tree_sha".to_string(),
    parents: vec!["parent_sha".to_string()],
    author: Some(CommitAuthor {
        name: "Jane Doe".to_string(),
        email: "jane@example.com".to_string(),
        date: None,
    }),
    committer: None,
    signature: None,
};
let commit = git_data.create_commit("owner", "repo", &request).await?;
```

## Reference Operations

### List References
```rust
async fn list_refs(&self, owner: &str, repo: &str, namespace: Option<&str>) -> GitHubResult<Vec<GitReference>>
```

**Examples:**
```rust
// List all references
let all_refs = git_data.list_refs("owner", "repo", None).await?;

// List all branches
let branches = git_data.list_refs("owner", "repo", Some("heads")).await?;

// List all tags
let tags = git_data.list_refs("owner", "repo", Some("tags")).await?;
```

### Get Reference
```rust
async fn get_ref(&self, owner: &str, repo: &str, ref_name: &str) -> GitHubResult<GitReference>
```

**Examples:**
```rust
// Get a branch (with or without "refs/" prefix)
let branch = git_data.get_ref("owner", "repo", "heads/main").await?;
let branch = git_data.get_ref("owner", "repo", "refs/heads/main").await?;

// Get a tag
let tag = git_data.get_ref("owner", "repo", "tags/v1.0.0").await?;
```

### Create Reference
```rust
async fn create_ref(&self, owner: &str, repo: &str, ref_name: &str, sha: &str) -> GitHubResult<GitReference>
```

**Examples:**
```rust
// Create a branch
let branch = git_data.create_ref("owner", "repo", "heads/feature", "commit_sha").await?;

// Create a tag reference
let tag_ref = git_data.create_ref("owner", "repo", "tags/v1.0.0", "commit_sha").await?;
```

### Update Reference
```rust
async fn update_ref(&self, owner: &str, repo: &str, ref_name: &str, sha: &str, force: bool) -> GitHubResult<GitReference>
```

**Examples:**
```rust
// Fast-forward update
let updated = git_data.update_ref("owner", "repo", "heads/main", "new_sha", false).await?;

// Force update (non-fast-forward)
let updated = git_data.update_ref("owner", "repo", "heads/main", "new_sha", true).await?;
```

### Delete Reference
```rust
async fn delete_ref(&self, owner: &str, repo: &str, ref_name: &str) -> GitHubResult<()>
```

**Example:**
```rust
// Delete a branch
git_data.delete_ref("owner", "repo", "heads/old-feature").await?;

// Delete a tag
git_data.delete_ref("owner", "repo", "tags/v0.1.0").await?;
```

## Tag Operations

### Get Tag
```rust
async fn get_tag(&self, owner: &str, repo: &str, sha: &str) -> GitHubResult<GitTag>
```

**Example:**
```rust
let tag = git_data.get_tag("owner", "repo", "tag_sha").await?;
println!("Tag: {} - {}", tag.tag, tag.message);
println!("Tagger: {} <{}>", tag.tagger.name, tag.tagger.email);
```

### Create Tag
```rust
async fn create_tag(&self, owner: &str, repo: &str, request: &CreateTagRequest) -> GitHubResult<GitTag>
```

**Example:**
```rust
let request = CreateTagRequest {
    tag: "v1.0.0".to_string(),
    message: "Release version 1.0.0\n\nFirst stable release.".to_string(),
    object: "commit_sha".to_string(),
    object_type: TagObjectType::Commit,
    tagger: Some(CommitAuthor {
        name: "Release Manager".to_string(),
        email: "releases@example.com".to_string(),
        date: None,
    }),
};
let tag = git_data.create_tag("owner", "repo", &request).await?;
```

## Common Workflows

### Creating a File Programmatically

```rust
// 1. Create blob for file content
let blob_req = CreateBlobRequest {
    content: "fn main() {\n    println!(\"Hello\");\n}".to_string(),
    encoding: BlobEncoding::Utf8,
};
let blob = git_data.create_blob("owner", "repo", &blob_req).await?;

// 2. Get base tree from parent commit
let parent_commit = git_data.get_commit("owner", "repo", "parent_sha").await?;
let base_tree_sha = parent_commit.tree.sha;

// 3. Create new tree with the file
let tree_req = CreateTreeRequest {
    tree: vec![
        CreateTreeEntry {
            path: "src/main.rs".to_string(),
            mode: TreeMode::File,
            entry_type: TreeEntryType::Blob,
            sha: Some(blob.sha),
            content: None,
        },
    ],
    base_tree: Some(base_tree_sha),
};
let tree = git_data.create_tree("owner", "repo", &tree_req).await?;

// 4. Create commit
let commit_req = CreateCommitRequest {
    message: "Add main.rs".to_string(),
    tree: tree.sha,
    parents: vec!["parent_sha".to_string()],
    author: None,
    committer: None,
    signature: None,
};
let commit = git_data.create_commit("owner", "repo", &commit_req).await?;

// 5. Update branch reference
git_data.update_ref("owner", "repo", "heads/main", &commit.sha, false).await?;
```

### Creating a Release Tag

```rust
// 1. Create annotated tag
let tag_req = CreateTagRequest {
    tag: "v2.0.0".to_string(),
    message: "Version 2.0.0\n\nBreaking changes:\n- API v2\n- New features".to_string(),
    object: "release_commit_sha".to_string(),
    object_type: TagObjectType::Commit,
    tagger: Some(CommitAuthor {
        name: "CI Bot".to_string(),
        email: "ci@example.com".to_string(),
        date: None,
    }),
};
let tag = git_data.create_tag("owner", "repo", &tag_req).await?;

// 2. Create reference pointing to the tag
git_data.create_ref("owner", "repo", "tags/v2.0.0", &tag.sha).await?;
```

### Merging Branches

```rust
// 1. Get commits from both branches
let base_commit = git_data.get_commit("owner", "repo", "base_sha").await?;
let head_commit = git_data.get_commit("owner", "repo", "head_sha").await?;

// 2. Create merge commit (simplified - actual merge would need tree merging)
let merge_req = CreateCommitRequest {
    message: "Merge branch 'feature' into main".to_string(),
    tree: head_commit.tree.sha, // Simplified
    parents: vec![base_commit.sha, head_commit.sha],
    author: None,
    committer: None,
    signature: None,
};
let merge_commit = git_data.create_commit("owner", "repo", &merge_req).await?;

// 3. Update main branch
git_data.update_ref("owner", "repo", "heads/main", &merge_commit.sha, false).await?;
```

## Type Enums

### BlobEncoding
- `Utf8` - UTF-8 encoding
- `Base64` - Base64 encoding

### TreeMode
- `File` - Regular file (100644)
- `Executable` - Executable file (100755)
- `Subdirectory` - Subdirectory (040000)
- `Submodule` - Submodule (160000)
- `Symlink` - Symbolic link (120000)

### TreeEntryType
- `Blob` - A blob (file)
- `Tree` - A tree (directory)
- `Commit` - A commit (submodule)

### TagObjectType
- `Commit` - Tag points to a commit
- `Tree` - Tag points to a tree
- `Blob` - Tag points to a blob

## Error Handling

All methods return `GitHubResult<T>` which wraps `Result<T, GitHubError>`. Common errors:

- `NotFound` - Resource doesn't exist
- `ValidationError` - Invalid request parameters
- `RateLimit` - API rate limit exceeded
- `Forbidden` - Insufficient permissions
- `Conflict` - Reference update conflict

**Example:**
```rust
match git_data.create_ref("owner", "repo", "heads/main", "sha").await {
    Ok(reference) => println!("Created: {}", reference.ref_name),
    Err(GitHubError { kind: GitHubErrorKind::AlreadyExists, .. }) => {
        println!("Reference already exists, updating instead...");
        git_data.update_ref("owner", "repo", "heads/main", "sha", false).await?;
    },
    Err(e) => return Err(e),
}
```

## Reference Name Conventions

The service handles "refs/" prefix automatically:

- **Input**: Can be with or without "refs/" prefix
  - `"heads/main"` or `"refs/heads/main"` both work
  - `"tags/v1.0"` or `"refs/tags/v1.0"` both work

- **Output**: Always includes full path
  - Returns `"refs/heads/main"`
  - Returns `"refs/tags/v1.0"`

**Best Practice**: Use the full path for clarity:
```rust
git_data.get_ref("owner", "repo", "refs/heads/main")
git_data.get_ref("owner", "repo", "refs/tags/v1.0.0")
```
