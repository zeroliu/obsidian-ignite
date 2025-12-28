// Port interfaces - abstractions for external dependencies
export type { FileInfo, IVaultProvider } from './IVaultProvider';
export type {
	FileMetadata,
	HeadingInfo,
	IMetadataProvider,
	ResolvedLinks,
} from './IMetadataProvider';
export type { IStorageAdapter } from './IStorageAdapter';
export type { ILLMProvider } from './ILLMProvider';
export type {
	BatchEmbeddingResult,
	EmbeddingConfig,
	EmbeddingInput,
	EmbeddingResult,
	IEmbeddingProvider,
} from './IEmbeddingProvider';
