import { scrubPII } from "./pii_scrubber.ts";

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

export type LLMCallFunction = (prompt: string, systemPrompt?: string) => Promise<string>;

const PINNED_MODEL = "gemini-1.5-flash-002";
const DEFAULT_TEMPERATURE = 0;

/**
 * Pinned Gemini client with:
 * - temperature = 0
 * - pinned model version
 * - PII scrubbing before sending
 * - 1 retry on network or JSON failure
 * - Pluggable mock provider for offline tests
 */
export class GeminiClient {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private mockProvider: LLMCallFunction | null = null;

  constructor(config?: GeminiConfig) {
    this.apiKey = config?.apiKey || (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY || "" : "");
    this.model = config?.model || (typeof process !== "undefined" ? process.env?.GEMINI_MODEL || PINNED_MODEL : PINNED_MODEL);
    this.temperature = config?.temperature ?? DEFAULT_TEMPERATURE;
  }

  /**
   * Injects a mock provider for zero-network testing.
   */
  public setMockProvider(provider: LLMCallFunction | null) {
    this.mockProvider = provider;
  }

  public getModel(): string {
    return this.model;
  }

  public getTemperature(): number {
    return this.temperature;
  }

  /**
   * Generates text with Gemini, enforcing PII scrubbing and 1 retry.
   */
  public async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    // 1. Privacy Scrub before sending
    const scrubbed = scrubPII(prompt);
    const sanitizedPrompt = scrubbed.scrubbedText;

    // 2. If mock provider registered, use it
    if (this.mockProvider) {
      return await this.mockProvider(sanitizedPrompt, systemPrompt);
    }

    // 3. Live call with 1 retry
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (!this.apiKey) {
          throw new Error("GEMINI_API_KEY is not configured.");
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          this.model
        )}:generateContent?key=${this.apiKey}`;

        const payload: Record<string, unknown> = {
          contents: [
            {
              role: "user",
              parts: [{ text: sanitizedPrompt }],
            },
          ],
          generationConfig: {
            temperature: this.temperature,
            responseMimeType: "application/json",
          },
        };

        if (systemPrompt) {
          payload.systemInstruction = {
            parts: [{ text: systemPrompt }],
          };
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) {
          throw new Error("Empty candidate response from Gemini API.");
        }

        return candidate;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === 1) {
          // Wait 250ms before retry
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    throw lastError || new Error("Gemini generateText failed after 2 attempts.");
  }
}
