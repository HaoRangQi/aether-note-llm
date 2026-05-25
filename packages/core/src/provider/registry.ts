import { AetherError } from "../errors.js";
import type { Feature, FeatureBinding, ProviderConfig } from "../types.js";
import { findPresetById } from "./presets.js";
import type { Provider, ProviderFactory } from "./types.js";

/**
 * Resolves `(feature) -> (provider, model)` and instantiates providers on demand.
 * Hosts (or AetherCore) call .getProvider() once per provider id; subsequent
 * lookups return the cached instance. apiKeys are passed in as a snapshot;
 * call .setApiKeys() after settings change.
 */
export class ProviderRegistry {
  private providers = new Map<string, Provider>();
  private configs = new Map<string, ProviderConfig>();
  private bindings = new Map<Feature, FeatureBinding>();
  private apiKeys: Record<string, string> = {};
  private readonly factories: Map<string, ProviderFactory>;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;

  constructor(args: {
    factories: ProviderFactory[];
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
  }) {
    this.factories = new Map(args.factories.map((f) => [f.kind, f]));
    this.fetchImpl = args.fetch;
  }

  /**
   * Register or replace a factory by `kind`. Tests use this to inject a
   * MockProvider in place of the OpenAI-compatible adapter without reaching
   * into private state. Production code only registers via the constructor.
   */
  registerFactory(factory: ProviderFactory): void {
    this.factories.set(factory.kind, factory);
    this.providers.clear();
  }

  setConfigs(configs: ProviderConfig[]): void {
    this.configs.clear();
    this.providers.clear();
    for (const c of configs) this.configs.set(c.id, c);
  }

  setBindings(bindings: FeatureBinding[]): void {
    this.bindings.clear();
    for (const b of bindings) this.bindings.set(b.feature, b);
  }

  setApiKeys(apiKeys: Record<string, string>): void {
    this.apiKeys = { ...apiKeys };
    this.providers.clear();
  }

  getBinding(feature: Feature): FeatureBinding {
    const b = this.bindings.get(feature);
    if (!b) throw new AetherError("BINDING_NOT_FOUND", `No binding for feature: ${feature}`);
    return b;
  }

  getProvider(providerId: string, factoryKind = "openai-compatible"): Provider {
    const cached = this.providers.get(providerId);
    if (cached) return cached;
    const config = this.configs.get(providerId);
    if (!config) throw new AetherError("PROVIDER_NOT_FOUND", `Unknown provider: ${providerId}`);
    if (!config.enabled) throw new AetherError("PROVIDER_NOT_FOUND", `Disabled: ${providerId}`);
    const factory = this.factories.get(factoryKind);
    if (!factory) throw new AetherError("PROVIDER_NOT_FOUND", `Unknown factory: ${factoryKind}`);
    const apiKey = this.apiKeys[config.apiKeyRef]?.trim() ?? "";
    if (providerRequiresApiKey(config) && !apiKey) {
      throw new AetherError("API_KEY_MISSING", `Missing key for provider ${providerId}`);
    }
    if (!isValidHttpUrl(config.baseUrl)) {
      throw new AetherError(
        "PROVIDER_CONFIG_INVALID",
        `Invalid base URL for provider ${providerId}`,
      );
    }
    const instance = factory.create({
      id: providerId,
      baseUrl: config.baseUrl,
      apiKey,
      defaultHeaders: config.defaultHeaders,
      fetch: this.fetchImpl,
    });
    this.providers.set(providerId, instance);
    return instance;
  }

  resolve(feature: Feature): { provider: Provider; model: string; binding: FeatureBinding } {
    const binding = this.getBinding(feature);
    return { provider: this.getProvider(binding.providerId), model: binding.modelName, binding };
  }
}

function providerRequiresApiKey(config: ProviderConfig): boolean {
  const preset = config.kind ? findPresetById(config.kind) : undefined;
  return preset?.requiresApiKey !== false;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
