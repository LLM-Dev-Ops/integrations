/**
 * Unit tests for Pinecone Filter Types
 *
 * Tests the type guards and type definitions for metadata filters.
 */

import { describe, it, expect } from "vitest";
import {
  isAndCondition,
  isOrCondition,
  isFieldCondition,
  LogicalOperator,
  ComparisonOperator,
} from "../src/types/filter.js";
import type { FilterCondition } from "../src/types/filter.js";

describe("Filter Type Guards", () => {
  describe("isAndCondition", () => {
    it("should return true for AND conditions", () => {
      const condition: FilterCondition = {
        $and: [
          { status: { $eq: "active" } },
          { age: { $gte: 18 } },
        ],
      };

      expect(isAndCondition(condition)).toBe(true);
    });

    it("should return false for OR conditions", () => {
      const condition: FilterCondition = {
        $or: [
          { country: { $eq: "US" } },
          { country: { $eq: "CA" } },
        ],
      };

      expect(isAndCondition(condition)).toBe(false);
    });

    it("should return false for field conditions", () => {
      const condition: FilterCondition = {
        status: { $eq: "active" },
      };

      expect(isAndCondition(condition)).toBe(false);
    });

    it("should narrow type in conditional", () => {
      const condition: FilterCondition = {
        $and: [{ field: { $eq: "value" } }],
      };

      if (isAndCondition(condition)) {
        // TypeScript should know condition.$and exists
        expect(condition.$and).toBeDefined();
        expect(Array.isArray(condition.$and)).toBe(true);
      }
    });
  });

  describe("isOrCondition", () => {
    it("should return true for OR conditions", () => {
      const condition: FilterCondition = {
        $or: [
          { status: { $eq: "active" } },
          { status: { $eq: "pending" } },
        ],
      };

      expect(isOrCondition(condition)).toBe(true);
    });

    it("should return false for AND conditions", () => {
      const condition: FilterCondition = {
        $and: [
          { status: { $eq: "active" } },
          { age: { $gte: 18 } },
        ],
      };

      expect(isOrCondition(condition)).toBe(false);
    });

    it("should return false for field conditions", () => {
      const condition: FilterCondition = {
        status: { $eq: "active" },
      };

      expect(isOrCondition(condition)).toBe(false);
    });

    it("should narrow type in conditional", () => {
      const condition: FilterCondition = {
        $or: [{ field: { $eq: "value" } }],
      };

      if (isOrCondition(condition)) {
        // TypeScript should know condition.$or exists
        expect(condition.$or).toBeDefined();
        expect(Array.isArray(condition.$or)).toBe(true);
      }
    });
  });

  describe("isFieldCondition", () => {
    it("should return true for field conditions", () => {
      const condition: FilterCondition = {
        status: { $eq: "active" },
      };

      expect(isFieldCondition(condition)).toBe(true);
    });

    it("should return true for multiple field conditions", () => {
      const condition: FilterCondition = {
        status: { $eq: "active" },
        age: { $gte: 18 },
      };

      expect(isFieldCondition(condition)).toBe(true);
    });

    it("should return false for AND conditions", () => {
      const condition: FilterCondition = {
        $and: [{ status: { $eq: "active" } }],
      };

      expect(isFieldCondition(condition)).toBe(false);
    });

    it("should return false for OR conditions", () => {
      const condition: FilterCondition = {
        $or: [{ status: { $eq: "active" } }],
      };

      expect(isFieldCondition(condition)).toBe(false);
    });
  });

  describe("combined type guard usage", () => {
    it("should correctly identify different condition types", () => {
      const andCondition: FilterCondition = {
        $and: [{ a: { $eq: 1 } }],
      };
      const orCondition: FilterCondition = {
        $or: [{ b: { $eq: 2 } }],
      };
      const fieldCondition: FilterCondition = {
        c: { $eq: 3 },
      };

      expect(isAndCondition(andCondition)).toBe(true);
      expect(isOrCondition(andCondition)).toBe(false);
      expect(isFieldCondition(andCondition)).toBe(false);

      expect(isAndCondition(orCondition)).toBe(false);
      expect(isOrCondition(orCondition)).toBe(true);
      expect(isFieldCondition(orCondition)).toBe(false);

      expect(isAndCondition(fieldCondition)).toBe(false);
      expect(isOrCondition(fieldCondition)).toBe(false);
      expect(isFieldCondition(fieldCondition)).toBe(true);
    });
  });
});

describe("Filter Enums", () => {
  describe("LogicalOperator", () => {
    it("should have And variant with $and value", () => {
      expect(LogicalOperator.And).toBe("$and");
    });

    it("should have Or variant with $or value", () => {
      expect(LogicalOperator.Or).toBe("$or");
    });

    it("should be usable in filter conditions", () => {
      const condition: FilterCondition = {
        [LogicalOperator.And]: [
          { status: { $eq: "active" } },
        ],
      };

      expect(condition).toEqual({
        $and: [{ status: { $eq: "active" } }],
      });
    });
  });

  describe("ComparisonOperator", () => {
    it("should have all comparison operators", () => {
      expect(ComparisonOperator.Eq).toBe("$eq");
      expect(ComparisonOperator.Ne).toBe("$ne");
      expect(ComparisonOperator.Gt).toBe("$gt");
      expect(ComparisonOperator.Gte).toBe("$gte");
      expect(ComparisonOperator.Lt).toBe("$lt");
      expect(ComparisonOperator.Lte).toBe("$lte");
      expect(ComparisonOperator.In).toBe("$in");
      expect(ComparisonOperator.Nin).toBe("$nin");
    });

    it("should be usable in field conditions", () => {
      const condition: FilterCondition = {
        status: {
          [ComparisonOperator.Eq]: "active",
        },
      };

      expect(condition).toEqual({
        status: { $eq: "active" },
      });
    });
  });
});

describe("Filter Structure Validation", () => {
  describe("FieldCondition", () => {
    it("should support single operator", () => {
      const condition: FilterCondition = {
        age: { $eq: 25 },
      };

      expect(condition).toBeDefined();
    });

    it("should support multiple operators on same field", () => {
      const condition: FilterCondition = {
        age: { $gte: 18, $lte: 65 },
      };

      expect(condition).toBeDefined();
      if (isFieldCondition(condition)) {
        expect(condition.age).toEqual({ $gte: 18, $lte: 65 });
      }
    });

    it("should support array operators", () => {
      const condition: FilterCondition = {
        status: { $in: ["active", "pending"] },
      };

      expect(condition).toBeDefined();
    });
  });

  describe("Nested Conditions", () => {
    it("should support deeply nested AND/OR", () => {
      const condition: FilterCondition = {
        $and: [
          { status: { $eq: "active" } },
          {
            $or: [
              { country: { $eq: "US" } },
              { country: { $eq: "CA" } },
            ],
          },
        ],
      };

      expect(isAndCondition(condition)).toBe(true);
      if (isAndCondition(condition)) {
        expect(condition.$and).toHaveLength(2);
        expect(isOrCondition(condition.$and[1])).toBe(true);
      }
    });

    it("should support multiple levels of nesting", () => {
      const condition: FilterCondition = {
        $and: [
          {
            $or: [
              { type: { $eq: "A" } },
              { type: { $eq: "B" } },
            ],
          },
          {
            $or: [
              { status: { $eq: "active" } },
              { status: { $eq: "pending" } },
            ],
          },
        ],
      };

      expect(isAndCondition(condition)).toBe(true);
      if (isAndCondition(condition)) {
        expect(condition.$and).toHaveLength(2);
        condition.$and.forEach((subCondition) => {
          expect(isOrCondition(subCondition)).toBe(true);
        });
      }
    });
  });

  describe("MetadataValue types", () => {
    it("should support string values", () => {
      const condition: FilterCondition = {
        name: { $eq: "John" },
      };

      expect(condition).toBeDefined();
    });

    it("should support number values", () => {
      const condition: FilterCondition = {
        age: { $eq: 42 },
        score: { $gte: 99.5 },
      };

      expect(condition).toBeDefined();
    });

    it("should support boolean values", () => {
      const condition: FilterCondition = {
        verified: { $eq: true },
        disabled: { $ne: false },
      };

      expect(condition).toBeDefined();
    });

    it("should support string array values", () => {
      const condition: FilterCondition = {
        tags: { $in: ["typescript", "javascript", "node"] },
      };

      expect(condition).toBeDefined();
    });
  });
});

describe("Real-world Filter Examples", () => {
  it("should construct a user search filter", () => {
    const filter: FilterCondition = {
      $and: [
        { user_type: { $eq: "premium" } },
        { age: { $gte: 18, $lte: 65 } },
        { country: { $in: ["US", "CA", "UK"] } },
        { verified: { $eq: true } },
      ],
    };

    expect(isAndCondition(filter)).toBe(true);
  });

  it("should construct an e-commerce product filter", () => {
    const filter: FilterCondition = {
      $and: [
        { category: { $in: ["electronics", "computers"] } },
        { price: { $gte: 100, $lte: 1000 } },
        { in_stock: { $eq: true } },
        { brand: { $ne: "Generic" } },
      ],
    };

    expect(isAndCondition(filter)).toBe(true);
  });

  it("should construct a content moderation filter", () => {
    const filter: FilterCondition = {
      $or: [
        { flagged: { $eq: true } },
        { reports: { $gte: 5 } },
        { status: { $in: ["under_review", "flagged"] } },
      ],
    };

    expect(isOrCondition(filter)).toBe(true);
  });

  it("should construct a complex multi-level filter", () => {
    const filter: FilterCondition = {
      $and: [
        { document_type: { $eq: "article" } },
        {
          $or: [
            { category: { $eq: "technology" } },
            { category: { $eq: "science" } },
          ],
        },
        { published: { $eq: true } },
        { views: { $gte: 1000 } },
        { author_verified: { $eq: true } },
      ],
    };

    expect(isAndCondition(filter)).toBe(true);
    if (isAndCondition(filter)) {
      const orCondition = filter.$and[1];
      expect(isOrCondition(orCondition)).toBe(true);
    }
  });
});
