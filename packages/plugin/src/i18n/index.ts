/**
 * 文案表 schema — 所有语言都要实现这个接口。
 *
 * 设计原则：
 * - 平铺一层（dict["settings.providers.title"]），不嵌套；好搜、好补、好 grep
 * - 占位符用 {name} 形式，t() 支持简单替换
 * - 新加 key 时两个语言文件都要补，否则 TS 会报错
 */
export type Dict = Record<string, string>;

export type Locale = "zh-CN" | "en";

import { zhCN } from "./zh-CN.js";
import { en } from "./en.js";

const TABLES: Record<Locale, Dict> = {
  "zh-CN": zhCN,
  en: en,
};

let currentLocale: Locale = "zh-CN";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/**
 * 取文案。找不到 key 时 fallback 到 en，再找不到原样返回 key 本身（方便发现漏译）。
 * 支持 {name} 占位符：t("hello", { name: "World" })。
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const table = TABLES[currentLocale];
  let s = table[key] ?? TABLES.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
