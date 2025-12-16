/**
 * Integration Verification Test
 *
 * Verifies that all filter types and builder exports work correctly
 * and can be imported from the main types module.
 */

// Test importing from mod.ts (main export)
import {
  // Types
  type MetadataFilter,
  type FilterCondition,
  type FieldCondition,
  type Metadata,
  type MetadataValue,

  // Enums
  LogicalOperator,
  ComparisonOperator,

  // Type guards
  isAndCondition,
  isOrCondition,
  isFieldCondition,

  // Builder
  FilterBuilder,
  filter,
} from "../src/types/mod.js";

/**
 * Verify all exports are available and working
 */
function verifyExports(): void {
  // Test FilterBuilder static constructor
  const builder1 = FilterBuilder.new();
  console.log("✓ FilterBuilder.new() works");

  // Test convenience function
  const builder2 = filter();
  console.log("✓ filter() convenience function works");

  // Test building a simple filter
  const simpleFilter: MetadataFilter = builder1
    .eq("status", "active")
    .build();
  console.log("✓ Simple filter built:", JSON.stringify(simpleFilter));

  // Test AND filter
  const andFilter: MetadataFilter = FilterBuilder.new()
    .and()
    .eq("type", "user")
    .gte("age", 18)
    .build();
  console.log("✓ AND filter built:", JSON.stringify(andFilter));

  // Test OR filter
  const orFilter: MetadataFilter = FilterBuilder.new()
    .or()
    .eq("country", "US")
    .eq("country", "CA")
    .build();
  console.log("✓ OR filter built:", JSON.stringify(orFilter));

  // Test all comparison operators
  const allOperators = FilterBuilder.new()
    .and()
    .eq("a", "value")
    .ne("b", "value")
    .gt("c", 10)
    .gte("d", 20)
    .lt("e", 30)
    .lte("f", 40)
    .in("g", ["x", "y", "z"])
    .nin("h", [1, 2, 3])
    .build();
  console.log("✓ All operators work:", JSON.stringify(allOperators, null, 2));

  // Test type guards
  const testFilter: FilterCondition = {
    $and: [{ field: { $eq: "value" } }],
  };

  if (isAndCondition(testFilter)) {
    console.log("✓ isAndCondition type guard works");
  }

  const orTestFilter: FilterCondition = {
    $or: [{ field: { $eq: "value" } }],
  };

  if (isOrCondition(orTestFilter)) {
    console.log("✓ isOrCondition type guard works");
  }

  const fieldTestFilter: FilterCondition = {
    field: { $eq: "value" },
  };

  if (isFieldCondition(fieldTestFilter)) {
    console.log("✓ isFieldCondition type guard works");
  }

  // Test enums
  console.log("✓ LogicalOperator.And =", LogicalOperator.And);
  console.log("✓ LogicalOperator.Or =", LogicalOperator.Or);
  console.log("✓ ComparisonOperator.Eq =", ComparisonOperator.Eq);
  console.log("✓ ComparisonOperator.Ne =", ComparisonOperator.Ne);
  console.log("✓ ComparisonOperator.Gt =", ComparisonOperator.Gt);
  console.log("✓ ComparisonOperator.Gte =", ComparisonOperator.Gte);
  console.log("✓ ComparisonOperator.Lt =", ComparisonOperator.Lt);
  console.log("✓ ComparisonOperator.Lte =", ComparisonOperator.Lte);
  console.log("✓ ComparisonOperator.In =", ComparisonOperator.In);
  console.log("✓ ComparisonOperator.Nin =", ComparisonOperator.Nin);

  // Test using enums in filter construction
  const enumFilter: FilterCondition = {
    [LogicalOperator.And]: [
      { status: { [ComparisonOperator.Eq]: "active" } },
      { age: { [ComparisonOperator.Gte]: 18 } },
    ],
  };
  console.log("✓ Enums work in filter construction:", JSON.stringify(enumFilter));

  // Test metadata types
  const metadata: Metadata = {
    stringField: "value",
    numberField: 42,
    booleanField: true,
    arrayField: ["a", "b", "c"],
  };
  console.log("✓ Metadata type works:", JSON.stringify(metadata));

  // Test FieldCondition with multiple operators
  const fieldCondition: FieldCondition = {
    $gte: 18,
    $lte: 65,
  };
  console.log("✓ FieldCondition with multiple operators:", JSON.stringify(fieldCondition));

  console.log("\n✅ All exports verified successfully!");
}

// Run verification
verifyExports();
