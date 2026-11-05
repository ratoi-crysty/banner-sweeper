export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  mediaType: 'image/jpeg' | 'image/png';
  /** Base64, without a `data:` prefix: local servers take base64 images only. */
  data: string;
}

/** What a message or a tool result carries across the seam, whatever the backend. */
export type ContentBlock = TextBlock | ImageBlock;
