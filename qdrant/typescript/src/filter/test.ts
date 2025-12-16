/**
 * Quick validation tests for FilterBuilder.
 *
 * These tests verify the basic functionality of the FilterBuilder.
 * For comprehensive testing, use a proper test framework.
 */

import { FilterBuilder } from './builder.js';
import { FilterValidationErrorCode } from './types.js';

/**
 * Test suite runner.
 */
export function runTests(): void {
  console.log('Running FilterBuilder tests...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Basic field match
  try {
    const filter = new FilterBuilder()
      .fieldMatch('category', 'electronics')
      .fieldMatch('status', 'active')
      .build();

    if (filter.must.length === 2) {
      console.log('✓ Test 1: Basic field match - PASSED');
      passed++;
    } else {
      console.log('✗ Test 1: Basic field match - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 1: Basic field match - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 2: Match any
  try {
    const filter = new FilterBuilder()
      .fieldMatchAny('brand', ['apple', 'samsung'])
      .build();

    const condition = filter.must[0];
    if (
      condition.type === 'Field' &&
      condition.condition.match?.type === 'Keywords' &&
      condition.condition.match.values.length === 2
    ) {
      console.log('✓ Test 2: Match any - PASSED');
      passed++;
    } else {
      console.log('✗ Test 2: Match any - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 2: Match any - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 3: Range filtering
  try {
    const filter = new FilterBuilder()
      .fieldBetween('price', 100, 500)
      .build();

    const condition = filter.must[0];
    if (
      condition.type === 'Field' &&
      condition.condition.range?.gte === 100 &&
      condition.condition.range?.lte === 500
    ) {
      console.log('✓ Test 3: Range filtering - PASSED');
      passed++;
    } else {
      console.log('✗ Test 3: Range filtering - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 3: Range filtering - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 4: Geographic radius
  try {
    const filter = new FilterBuilder()
      .geoRadius('location', 40.7128, -74.0060, 5000)
      .build();

    const condition = filter.must[0];
    if (
      condition.type === 'Field' &&
      condition.condition.geoRadius?.center.lat === 40.7128 &&
      condition.condition.geoRadius?.radiusMeters === 5000
    ) {
      console.log('✓ Test 4: Geographic radius - PASSED');
      passed++;
    } else {
      console.log('✗ Test 4: Geographic radius - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 4: Geographic radius - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 5: Geographic bounding box
  try {
    const filter = new FilterBuilder()
      .geoBoundingBox(
        'location',
        { lat: 40.8, lon: -74.1 },
        { lat: 40.7, lon: -74.0 }
      )
      .build();

    const condition = filter.must[0];
    if (
      condition.type === 'Field' &&
      condition.condition.geoBoundingBox?.topLeft.lat === 40.8
    ) {
      console.log('✓ Test 5: Geographic bounding box - PASSED');
      passed++;
    } else {
      console.log('✗ Test 5: Geographic bounding box - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 5: Geographic bounding box - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 6: Existence checks
  try {
    const filter = new FilterBuilder()
      .fieldExists('description')
      .fieldIsNull('deletedAt')
      .build();

    if (filter.must.length === 2) {
      const existsCondition = filter.must[0];
      const nullCondition = filter.must[1];
      if (
        existsCondition.type === 'Field' &&
        existsCondition.condition.isEmpty === false &&
        nullCondition.type === 'Field' &&
        nullCondition.condition.isNull === true
      ) {
        console.log('✓ Test 6: Existence checks - PASSED');
        passed++;
      } else {
        console.log('✗ Test 6: Existence checks - FAILED');
        failed++;
      }
    } else {
      console.log('✗ Test 6: Existence checks - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 6: Existence checks - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 7: Point ID filtering
  try {
    const filter = new FilterBuilder()
      .hasId(['uuid-1', 'uuid-2', 123])
      .build();

    const condition = filter.must[0];
    if (condition.type === 'HasId' && condition.condition.ids.length === 3) {
      console.log('✓ Test 7: Point ID filtering - PASSED');
      passed++;
    } else {
      console.log('✗ Test 7: Point ID filtering - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 7: Point ID filtering - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 8: Nested filter
  try {
    const nestedFilter = new FilterBuilder()
      .fieldMatch('color', 'red')
      .build();

    const filter = new FilterBuilder()
      .nested('variants', nestedFilter)
      .build();

    const condition = filter.must[0];
    if (
      condition.type === 'Nested' &&
      condition.condition.key === 'variants' &&
      condition.condition.filter.must.length === 1
    ) {
      console.log('✓ Test 8: Nested filter - PASSED');
      passed++;
    } else {
      console.log('✗ Test 8: Nested filter - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 8: Nested filter - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 9: OR combination
  try {
    const filter1 = new FilterBuilder().fieldMatch('category', 'electronics');
    const filter2 = new FilterBuilder().fieldMatch('brand', 'apple');

    const combined = filter1.or(filter2).build();

    if (combined.should.length === 2) {
      console.log('✓ Test 9: OR combination - PASSED');
      passed++;
    } else {
      console.log('✗ Test 9: OR combination - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 9: OR combination - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 10: Validation
  try {
    const builder = new FilterBuilder()
      .fieldMatch('category', 'electronics')
      .fieldBetween('price', 100, 500);

    const validation = builder.validate();

    if (validation.isValid && validation.errors.length === 0) {
      console.log('✓ Test 10: Validation (valid filter) - PASSED');
      passed++;
    } else {
      console.log('✗ Test 10: Validation (valid filter) - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 10: Validation (valid filter) - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 11: Error handling - invalid range
  try {
    new FilterBuilder().fieldBetween('price', 1000, 100).build();
    console.log('✗ Test 11: Error handling (invalid range) - FAILED (should throw)');
    failed++;
  } catch (error) {
    if ((error as Error).message.includes('Invalid range')) {
      console.log('✓ Test 11: Error handling (invalid range) - PASSED');
      passed++;
    } else {
      console.log('✗ Test 11: Error handling (invalid range) - FAILED (wrong error)');
      failed++;
    }
  }

  // Test 12: Error handling - empty match array
  try {
    new FilterBuilder().fieldMatchAny('brands', []).build();
    console.log('✗ Test 12: Error handling (empty array) - FAILED (should throw)');
    failed++;
  } catch (error) {
    if ((error as Error).message.includes('at least one value')) {
      console.log('✓ Test 12: Error handling (empty array) - PASSED');
      passed++;
    } else {
      console.log('✗ Test 12: Error handling (empty array) - FAILED (wrong error)');
      failed++;
    }
  }

  // Test 13: Error handling - invalid coordinates
  try {
    new FilterBuilder().geoRadius('location', 100, 200, 5000).build();
    console.log('✗ Test 13: Error handling (invalid coords) - FAILED (should throw)');
    failed++;
  } catch (error) {
    if ((error as Error).message.includes('Invalid geographic coordinates')) {
      console.log('✓ Test 13: Error handling (invalid coords) - PASSED');
      passed++;
    } else {
      console.log('✗ Test 13: Error handling (invalid coords) - FAILED (wrong error)');
      failed++;
    }
  }

  // Test 14: Complex filter
  try {
    const filter = new FilterBuilder()
      .fieldMatch('category', 'electronics')
      .fieldMatchAny('brand', ['apple', 'samsung'])
      .fieldBetween('price', 100, 1000)
      .fieldGte('rating', 4.0)
      .fieldExists('images')
      .fieldIsNull('deletedAt')
      .build();

    if (filter.must.length === 6) {
      console.log('✓ Test 14: Complex filter - PASSED');
      passed++;
    } else {
      console.log('✗ Test 14: Complex filter - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 14: Complex filter - ERROR:', (error as Error).message);
    failed++;
  }

  // Test 15: Min should match
  try {
    const builder = new FilterBuilder()
      .should({
        type: 'Field',
        condition: { key: 'premium', match: { type: 'Bool', value: true } }
      })
      .should({
        type: 'Field',
        condition: { key: 'verified', match: { type: 'Bool', value: true } }
      })
      .minShouldMatch(1);

    const filter = builder.build();

    if (filter.minShould?.minCount === 1) {
      console.log('✓ Test 15: Min should match - PASSED');
      passed++;
    } else {
      console.log('✗ Test 15: Min should match - FAILED');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 15: Min should match - ERROR:', (error as Error).message);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed`);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}
