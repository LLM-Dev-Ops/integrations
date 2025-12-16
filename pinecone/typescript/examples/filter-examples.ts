/**
 * Pinecone Filter Builder Examples
 *
 * This file demonstrates how to use the FilterBuilder to create
 * Pinecone metadata filters with various operators and combinations.
 */

import { FilterBuilder, filter } from "../src/types/filter-builder.js";
import type { MetadataFilter } from "../src/types/filter.js";

/**
 * Example 1: Simple equality filter
 *
 * Single field equality check.
 */
function simpleEqualityFilter(): MetadataFilter {
  const result = FilterBuilder.new().eq("status", "active").build();

  console.log("Simple equality filter:");
  console.log(JSON.stringify(result, null, 2));
  // Output: { "status": { "$eq": "active" } }

  return result;
}

/**
 * Example 2: Multiple AND conditions
 *
 * Combines multiple conditions with AND logic.
 */
function multipleAndConditions(): MetadataFilter {
  const result = FilterBuilder.new()
    .and()
    .eq("status", "active")
    .gte("age", 18)
    .lt("age", 65)
    .build();

  console.log("\nMultiple AND conditions:");
  console.log(JSON.stringify(result, null, 2));
  // Output:
  // {
  //   "$and": [
  //     { "status": { "$eq": "active" } },
  //     { "age": { "$gte": 18 } },
  //     { "age": { "$lt": 65 } }
  //   ]
  // }

  return result;
}

/**
 * Example 3: OR conditions
 *
 * Combines multiple conditions with OR logic.
 */
function orConditions(): MetadataFilter {
  const result = FilterBuilder.new()
    .or()
    .eq("country", "US")
    .eq("country", "CA")
    .eq("country", "MX")
    .build();

  console.log("\nOR conditions:");
  console.log(JSON.stringify(result, null, 2));
  // Output:
  // {
  //   "$or": [
  //     { "country": { "$eq": "US" } },
  //     { "country": { "$eq": "CA" } },
  //     { "country": { "$eq": "MX" } }
  //   ]
  // }

  return result;
}

/**
 * Example 4: Range query
 *
 * Uses greater-than-or-equal and less-than-or-equal for a range.
 */
function rangeQuery(): MetadataFilter {
  const result = FilterBuilder.new().gte("score", 50).lte("score", 100).build();

  console.log("\nRange query:");
  console.log(JSON.stringify(result, null, 2));
  // Output:
  // {
  //   "$and": [
  //     { "score": { "$gte": 50 } },
  //     { "score": { "$lte": 100 } }
  //   ]
  // }

  return result;
}

/**
 * Example 5: In array operator
 *
 * Checks if a field value is in a list of allowed values.
 */
function inArrayOperator(): MetadataFilter {
  const result = FilterBuilder.new()
    .in("category", ["premium", "gold", "platinum"])
    .build();

  console.log("\nIn array operator:");
  console.log(JSON.stringify(result, null, 2));
  // Output: { "category": { "$in": ["premium", "gold", "platinum"] } }

  return result;
}

/**
 * Example 6: Not-in array operator
 *
 * Excludes records where field value is in the list.
 */
function notInArrayOperator(): MetadataFilter {
  const result = FilterBuilder.new()
    .nin("status", ["deleted", "archived", "suspended"])
    .build();

  console.log("\nNot-in array operator:");
  console.log(JSON.stringify(result, null, 2));
  // Output: { "status": { "$nin": ["deleted", "archived", "suspended"] } }

  return result;
}

/**
 * Example 7: Complex nested filter
 *
 * Demonstrates a realistic use case with nested AND/OR logic.
 * This would require manual construction as the builder doesn't
 * support nested logical operators yet.
 */
function complexNestedFilter(): MetadataFilter {
  // For complex nested filters, build manually:
  const result: MetadataFilter = {
    $and: [
      { age: { $gte: 18, $lte: 65 } },
      {
        $or: [
          { country: { $eq: "US" } },
          { country: { $eq: "CA" } },
        ],
      },
      { status: { $eq: "active" } },
    ],
  };

  console.log("\nComplex nested filter:");
  console.log(JSON.stringify(result, null, 2));
  // Output:
  // {
  //   "$and": [
  //     { "age": { "$gte": 18, "$lte": 65 } },
  //     {
  //       "$or": [
  //         { "country": { "$eq": "US" } },
  //         { "country": { "$eq": "CA" } }
  //       ]
  //     },
  //     { "status": { "$eq": "active" } }
  //   ]
  // }

  return result;
}

/**
 * Example 8: Using the convenience function
 *
 * Shows the shorter syntax using the filter() function.
 */
function convenienceFunction(): MetadataFilter {
  const result = filter()
    .eq("verified", true)
    .gte("score", 80)
    .build();

  console.log("\nUsing convenience function:");
  console.log(JSON.stringify(result, null, 2));
  // Output:
  // {
  //   "$and": [
  //     { "verified": { "$eq": true } },
  //     { "score": { "$gte": 80 } }
  //   ]
  // }

  return result;
}

/**
 * Example 9: Combining different operators
 *
 * Shows how to combine equality, comparison, and array operators.
 */
function combinedOperators(): MetadataFilter {
  const result = FilterBuilder.new()
    .and()
    .eq("type", "user")
    .ne("role", "admin")
    .gte("credits", 100)
    .in("tier", ["premium", "enterprise"])
    .build();

  console.log("\nCombined operators:");
  console.log(JSON.stringify(result, null, 2));
  // Output:
  // {
  //   "$and": [
  //     { "type": { "$eq": "user" } },
  //     { "role": { "$ne": "admin" } },
  //     { "credits": { "$gte": 100 } },
  //     { "tier": { "$in": ["premium", "enterprise"] } }
  //   ]
  // }

  return result;
}

/**
 * Example 10: Empty filter
 *
 * Shows what happens with no conditions.
 */
function emptyFilter(): MetadataFilter {
  const result = FilterBuilder.new().build();

  console.log("\nEmpty filter:");
  console.log(JSON.stringify(result, null, 2));
  // Output: {}

  return result;
}

// Run all examples if executed directly
// Uncomment the following to run examples:
/*
console.log("=== Pinecone Filter Builder Examples ===\n");

simpleEqualityFilter();
multipleAndConditions();
orConditions();
rangeQuery();
inArrayOperator();
notInArrayOperator();
complexNestedFilter();
convenienceFunction();
combinedOperators();
emptyFilter();

console.log("\n=== Examples Complete ===");
*/

export {
  simpleEqualityFilter,
  multipleAndConditions,
  orConditions,
  rangeQuery,
  inArrayOperator,
  notInArrayOperator,
  complexNestedFilter,
  convenienceFunction,
  combinedOperators,
  emptyFilter,
};
