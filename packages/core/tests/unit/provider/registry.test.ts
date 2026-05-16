import { beforeEach, describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import { ProviderRegistry } from "../../../src/provider/registry.js";
import type { Provider, ProviderFactory } from "../../../src/provider/types.js";

interface Captured {
  args?: {
    baseUrl: string;
    apiKey: string;
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
  };
}

function fakeFactory(captured: Captured): ProviderFactory {
  return {
    kind: "openai-compatible",
    create(args) {
      captured.args = args;
      const p: Provider = {
        id: args.id,
        async *chat() {
          yield { delta: "x", finishReason: "stop" as const };
        },
        async embed() {
          return { vectors: [[1]], model: "m", dim: 1 };
        },
        async listModels() {
          return ["m"];
        },
        async testConnection() {
          return { ok: true };
        },
      };
      return p;
    },
  };
}

describe("ProviderRegistry", () => {
  let captured: Captured;
  let reg: ProviderRegistry;
  beforeEach(() => {
    captured = {};
    reg = new ProviderRegistry({
      factories: [fakeFactory(captured)],
      fetch: async () => new Response("{}"),
    });
    reg.setConfigs([
      {
        id: "p1",
        name: "Test",
        baseUrl: "https://x",
        apiKeyRef: "k1",
        defaultHeaders: {},
        enabled: true,
        createdAt: 0,
      },
    ]);
    reg.setApiKeys({ k1: "secret" });
    reg.setBindings([{ feature: "chat", providerId: "p1", modelName: "m", params: {} }]);
  });

  it("resolves binding to provider + model", () => {
    const { provider, model } = reg.resolve("chat");
    expect(provider.id).toBe("p1");
    expect(model).toBe("m");
  });

  it("caches provider instances", () => {
    const a = reg.getProvider("p1");
    const b = reg.getProvider("p1");
    expect(a).toBe(b);
  });

  it("re-instantiates after setApiKeys", () => {
    const a = reg.getProvider("p1");
    reg.setApiKeys({ k1: "secret2" });
    const b = reg.getProvider("p1");
    expect(a).not.toBe(b);
  });

  it("throws BINDING_NOT_FOUND for unbound feature", () => {
    try {
      reg.resolve("embedding");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AetherError);
      expect((e as AetherError).code).toBe("BINDING_NOT_FOUND");
    }
  });

  it("throws API_KEY_MISSING when key absent", () => {
    reg.setApiKeys({});
    try {
      reg.getProvider("p1");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AetherError).code).toBe("API_KEY_MISSING");
    }
  });

  it("throws PROVIDER_NOT_FOUND when id unknown", () => {
    try {
      reg.getProvider("missing");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as AetherError).code).toBe("PROVIDER_NOT_FOUND");
    }
  });

  it("threads fetch + headers + baseUrl into factory", () => {
    reg.getProvider("p1");
    expect(captured.args?.baseUrl).toBe("https://x");
    expect(captured.args?.apiKey).toBe("secret");
    expect(typeof captured.args?.fetch).toBe("function");
  });

  it("registerFactory overrides existing kind and clears cache", () => {
    const first = reg.getProvider("p1");
    const replacement: ProviderFactory = {
      kind: "openai-compatible",
      create: () => ({
        id: "p1",
        async *chat() {
          yield { delta: "from-replacement", finishReason: "stop" as const };
        },
        async embed() {
          return { vectors: [[2]], model: "m", dim: 1 };
        },
        async listModels() {
          return ["m"];
        },
        async testConnection() {
          return { ok: true };
        },
      }),
    };
    reg.registerFactory(replacement);
    const second = reg.getProvider("p1");
    expect(second).not.toBe(first);
  });
});
