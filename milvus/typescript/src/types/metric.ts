/**
 * Distance/similarity metric types supported by Milvus.
 */
export enum MetricType {
  /** Euclidean distance (L2) - smaller is more similar */
  L2 = 'L2',
  /** Inner product - larger is more similar */
  IP = 'IP',
  /** Cosine similarity - larger is more similar */
  Cosine = 'COSINE',
  /** Jaccard distance for binary vectors */
  Jaccard = 'JACCARD',
  /** Hamming distance for binary vectors */
  Hamming = 'HAMMING',
}

/**
 * Index types supported by Milvus.
 */
export enum IndexType {
  /** Flat index - exact search, no compression */
  Flat = 'FLAT',
  /** IVF with flat quantization */
  IvfFlat = 'IVF_FLAT',
  /** IVF with scalar quantization (8-bit) */
  IvfSq8 = 'IVF_SQ8',
  /** IVF with product quantization */
  IvfPq = 'IVF_PQ',
  /** Hierarchical Navigable Small World graph */
  Hnsw = 'HNSW',
  /** Disk-based ANN index */
  DiskAnn = 'DISKANN',
  /** Auto-tuned index */
  AutoIndex = 'AUTOINDEX',
}

/**
 * Search parameters specific to each index type.
 */
export interface SearchParams {
  /** The index type these params are for */
  indexType: IndexType;
  /** Index-specific parameters */
  params: Record<string, number | string>;
}

/**
 * Create search params for IVF index types.
 * @param nprobe Number of clusters to search (1-65536)
 */
export function createIvfSearchParams(nprobe: number = 10): SearchParams {
  return {
    indexType: IndexType.IvfFlat,
    params: { nprobe },
  };
}

/**
 * Create search params for HNSW index.
 * @param ef Search expansion factor (1-32768)
 */
export function createHnswSearchParams(ef: number = 64): SearchParams {
  return {
    indexType: IndexType.Hnsw,
    params: { ef },
  };
}

/**
 * Create search params for DiskANN index.
 * @param searchList Search list size (1-65535)
 */
export function createDiskAnnSearchParams(searchList: number = 100): SearchParams {
  return {
    indexType: IndexType.DiskAnn,
    params: { search_list: searchList },
  };
}

/**
 * Create search params for AutoIndex.
 * @param level Auto-tuning level (1-5)
 */
export function createAutoIndexSearchParams(level: number = 1): SearchParams {
  return {
    indexType: IndexType.AutoIndex,
    params: { level },
  };
}

/**
 * Create search params for flat index (no params needed).
 */
export function createFlatSearchParams(): SearchParams {
  return {
    indexType: IndexType.Flat,
    params: {},
  };
}
