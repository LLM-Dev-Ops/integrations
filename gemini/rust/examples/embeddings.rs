//! Embeddings generation example for Gemini API.
//!
//! This example demonstrates:
//! - Generating single embeddings
//! - Batch embedding generation
//! - Different task types (RETRIEVAL_QUERY, RETRIEVAL_DOCUMENT, etc.)
//! - Understanding embedding dimensions
//! - Using embeddings for similarity search
//!
//! # Usage
//!
//! Set your API key as an environment variable:
//! ```bash
//! export GEMINI_API_KEY="your-api-key-here"
//! ```
//!
//! Then run:
//! ```bash
//! cargo run --example embeddings
//! ```

use integrations_gemini::{
    GeminiClientImpl,
    types::{
        EmbedContentRequest, Content, Part, TaskType,
    },
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    println!("=== Gemini Embeddings Example ===\n");

    // Create client
    println!("1. Creating Gemini client from environment...");
    let client = GeminiClientImpl::from_env()?;
    println!("   ✓ Client created successfully\n");

    // Example 1: Single embedding
    println!("=== Example 1: Single Text Embedding ===\n");
    example_single_embedding(&client).await?;

    println!("\n");

    // Example 2: Batch embeddings
    println!("=== Example 2: Batch Embeddings ===\n");
    example_batch_embeddings(&client).await?;

    println!("\n");

    // Example 3: Different task types
    println!("=== Example 3: Task Types ===\n");
    example_task_types(&client).await?;

    println!("\n");

    // Example 4: Semantic similarity
    println!("=== Example 4: Semantic Similarity ===\n");
    example_semantic_similarity(&client).await?;

    println!("\n=== Examples Complete ===");

    Ok(())
}

/// Example: Generate a single embedding.
async fn example_single_embedding(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Generating single embedding...");

    let text = "The quick brown fox jumps over the lazy dog.";
    println!("   Text: {}", text);

    let request = EmbedContentRequest {
        content: Content {
            role: None,
            parts: vec![
                Part::Text {
                    text: text.to_string(),
                }
            ],
        },
        task_type: Some(TaskType::RetrievalDocument),
        title: None,
        output_dimensionality: None,
    };

    println!("   Task type: RETRIEVAL_DOCUMENT");
    println!("   Model: text-embedding-004");

    // Note: EmbeddingsService is implemented
    let response = client.embeddings()
        .embed("text-embedding-004", request)
        .await?;

    println!("\n   ✓ Embedding generated successfully");

    if let Some(values) = &response.embedding.values {
        println!("   Embedding dimension: {}", values.len());
        println!("   First 5 values: {:?}", &values[..5.min(values.len())]);

        // Calculate L2 norm
        let norm: f32 = values.iter().map(|v| v * v).sum::<f32>().sqrt();
        println!("   L2 norm: {:.6}", norm);
    }

    Ok(())
}

/// Example: Generate batch embeddings.
async fn example_batch_embeddings(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Generating batch embeddings...");

    let texts = vec![
        "Machine learning is a subset of artificial intelligence.",
        "Deep learning uses neural networks with many layers.",
        "Natural language processing helps computers understand text.",
        "Computer vision enables machines to interpret images.",
    ];

    println!("   Generating embeddings for {} texts", texts.len());

    let requests: Vec<EmbedContentRequest> = texts.iter().map(|text| {
        EmbedContentRequest {
            content: Content {
                role: None,
                parts: vec![
                    Part::Text {
                        text: text.to_string(),
                    }
                ],
            },
            task_type: Some(TaskType::RetrievalDocument),
            title: None,
            output_dimensionality: None,
        }
    }).collect();

    // Note: EmbeddingsService is implemented
    let response = client.embeddings()
        .batch_embed("text-embedding-004", requests)
        .await?;

    println!("\n   ✓ Batch embeddings generated successfully");

    if let Some(embeddings) = &response.embeddings {
        println!("   Generated {} embeddings", embeddings.len());

        for (i, embedding) in embeddings.iter().enumerate() {
            if let Some(values) = &embedding.values {
                println!("\n   Embedding {}:", i + 1);
                println!("     Text: {}", &texts[i]);
                println!("     Dimension: {}", values.len());
                println!("     First 3 values: {:?}", &values[..3.min(values.len())]);
            }
        }
    }

    Ok(())
}

/// Example: Different task types.
async fn example_task_types(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Demonstrating different task types...");

    let text = "How do I create embeddings with Gemini?";

    // Example: Query embedding
    println!("\n   Task Type: RETRIEVAL_QUERY");
    println!("   Use case: Search queries, questions");

    let query_request = EmbedContentRequest {
        content: Content {
            role: None,
            parts: vec![
                Part::Text {
                    text: text.to_string(),
                }
            ],
        },
        task_type: Some(TaskType::RetrievalQuery),
        title: None,
        output_dimensionality: None,
    };

    let query_response = client.embeddings()
        .embed("text-embedding-004", query_request)
        .await?;

    if let Some(values) = &query_response.embedding.values {
        println!("   ✓ Query embedding generated: {} dimensions", values.len());
    }

    // Example: Document embedding
    println!("\n   Task Type: RETRIEVAL_DOCUMENT");
    println!("   Use case: Documents to be searched, knowledge base entries");

    let doc_request = EmbedContentRequest {
        content: Content {
            role: None,
            parts: vec![
                Part::Text {
                    text: "Embeddings are vector representations of text.".to_string(),
                }
            ],
        },
        task_type: Some(TaskType::RetrievalDocument),
        title: Some("Introduction to Embeddings".to_string()),
        output_dimensionality: None,
    };

    let doc_response = client.embeddings()
        .embed("text-embedding-004", doc_request)
        .await?;

    if let Some(values) = &doc_response.embedding.values {
        println!("   ✓ Document embedding generated: {} dimensions", values.len());
    }

    // Example: Semantic similarity
    println!("\n   Task Type: SEMANTIC_SIMILARITY");
    println!("   Use case: Comparing text similarity, clustering");

    let sim_request = EmbedContentRequest {
        content: Content {
            role: None,
            parts: vec![
                Part::Text {
                    text: "Text embedding for similarity comparison.".to_string(),
                }
            ],
        },
        task_type: Some(TaskType::SemanticSimilarity),
        title: None,
        output_dimensionality: None,
    };

    let sim_response = client.embeddings()
        .embed("text-embedding-004", sim_request)
        .await?;

    if let Some(values) = &sim_response.embedding.values {
        println!("   ✓ Similarity embedding generated: {} dimensions", values.len());
    }

    // Example: Classification
    println!("\n   Task Type: CLASSIFICATION");
    println!("   Use case: Text categorization, sentiment analysis");

    let class_request = EmbedContentRequest {
        content: Content {
            role: None,
            parts: vec![
                Part::Text {
                    text: "This product is amazing!".to_string(),
                }
            ],
        },
        task_type: Some(TaskType::Classification),
        title: None,
        output_dimensionality: None,
    };

    let class_response = client.embeddings()
        .embed("text-embedding-004", class_request)
        .await?;

    if let Some(values) = &class_response.embedding.values {
        println!("   ✓ Classification embedding generated: {} dimensions", values.len());
    }

    // Example: Clustering
    println!("\n   Task Type: CLUSTERING");
    println!("   Use case: Grouping similar documents, topic modeling");

    let cluster_request = EmbedContentRequest {
        content: Content {
            role: None,
            parts: vec![
                Part::Text {
                    text: "Document for clustering analysis.".to_string(),
                }
            ],
        },
        task_type: Some(TaskType::Clustering),
        title: None,
        output_dimensionality: None,
    };

    let cluster_response = client.embeddings()
        .embed("text-embedding-004", cluster_request)
        .await?;

    if let Some(values) = &cluster_response.embedding.values {
        println!("   ✓ Clustering embedding generated: {} dimensions", values.len());
    }

    println!("\n   Note: Different task types optimize embeddings for specific use cases.");

    Ok(())
}

/// Example: Computing semantic similarity.
async fn example_semantic_similarity(client: &GeminiClientImpl) -> Result<(), Box<dyn std::error::Error>> {
    println!("2. Computing semantic similarity...");

    let texts = vec![
        "The cat sat on the mat.",
        "A feline rested on the rug.",
        "The dog played in the park.",
    ];

    println!("\n   Comparing similarity between:");
    for (i, text) in texts.iter().enumerate() {
        println!("     {}. {}", i + 1, text);
    }

    // Generate embeddings for all texts
    let requests: Vec<EmbedContentRequest> = texts.iter().map(|text| {
        EmbedContentRequest {
            content: Content {
                role: None,
                parts: vec![
                    Part::Text {
                        text: text.to_string(),
                    }
                ],
            },
            task_type: Some(TaskType::SemanticSimilarity),
            title: None,
            output_dimensionality: None,
        }
    }).collect();

    let response = client.embeddings()
        .batch_embed("text-embedding-004", requests)
        .await?;

    if let Some(embeddings) = &response.embeddings {
        println!("\n   ✓ Embeddings generated");

        // Calculate cosine similarities
        if embeddings.len() >= 3 {
            let emb1 = &embeddings[0].values.as_ref().unwrap();
            let emb2 = &embeddings[1].values.as_ref().unwrap();
            let emb3 = &embeddings[2].values.as_ref().unwrap();

            let sim_1_2 = cosine_similarity(emb1, emb2);
            let sim_1_3 = cosine_similarity(emb1, emb3);
            let sim_2_3 = cosine_similarity(emb2, emb3);

            println!("\n   Cosine similarities:");
            println!("     Text 1 vs Text 2: {:.4}", sim_1_2);
            println!("     Text 1 vs Text 3: {:.4}", sim_1_3);
            println!("     Text 2 vs Text 3: {:.4}", sim_2_3);

            println!("\n   Analysis:");
            println!("     • Text 1 and 2 are semantically similar (same meaning)");
            println!("     • Text 3 is less similar (different topic)");
            println!("     • Higher cosine similarity = more similar meaning");
        }
    }

    println!("\n=== Embedding Use Cases ===");
    println!("  • Semantic search: Find relevant documents");
    println!("  • Recommendation systems: Find similar items");
    println!("  • Clustering: Group similar content");
    println!("  • Classification: Categorize text");
    println!("  • Duplicate detection: Find near-duplicates");

    Ok(())
}

/// Calculate cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot_product / (norm_a * norm_b)
}
