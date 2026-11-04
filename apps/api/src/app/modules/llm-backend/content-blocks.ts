import type Anthropic from '@anthropic-ai/sdk';
import { ContentBlock } from '@banner-sweeper/llm-backend';

type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type BetaToolResultBlockParam =
  Anthropic.Beta.Messages.BetaToolResultBlockParam;
type BetaToolResultContentBlockParam =
  Anthropic.Beta.Messages.BetaToolResultContentBlockParam;

/** A neutral block as message or tool-result content. Images are always base64. */
export function toBetaContent(
  block: ContentBlock,
): BetaContentBlockParam & BetaToolResultContentBlockParam {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: block.mediaType, data: block.data },
  };
}

/** A tool result's content back as neutral blocks. Our tools only produce text and images. */
export function fromToolResultContent(
  content: BetaToolResultBlockParam['content'],
): ContentBlock[] {
  if (content === undefined) {
    return [];
  }
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content.flatMap(
    (block: BetaToolResultContentBlockParam): ContentBlock[] => {
      if (block.type === 'text') {
        return [{ type: 'text', text: block.text }];
      }
      if (
        block.type === 'image' &&
        block.source.type === 'base64' &&
        (block.source.media_type === 'image/jpeg' ||
          block.source.media_type === 'image/png')
      ) {
        return [
          {
            type: 'image',
            mediaType: block.source.media_type,
            data: block.source.data,
          },
        ];
      }
      return [];
    },
  );
}
