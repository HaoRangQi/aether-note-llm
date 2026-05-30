export const notices: Array<{ message: string; timeoutMs?: number }> = [];
export const openedModals: Modal[] = [];

export class App {}

export class ItemView {
  app: unknown;
  containerEl = new FakeElement("container");

  constructor(readonly leaf: { app?: unknown } = {}) {
    this.app = leaf.app ?? {};
    this.containerEl.appendChild(new FakeElement("header"));
    this.containerEl.appendChild(new FakeElement("content"));
  }
}

export class FakeElement {
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  text = "";
  cls = "";
  disabled = false;
  checked = false;
  open = false;
  placeholder = "";
  rows = 0;
  title = "";
  type = "";
  value = "";
  onclick?: () => void | Promise<void>;
  onchange?: () => void | Promise<void>;
  style: Record<string, string> & { setProperty(name: string, value: string): void } =
    Object.assign(Object.create(null) as Record<string, string>, {
      setProperty(name: string, value: string) {
        this[name] = value;
      },
    });

  constructor(public readonly tag = "div") {}

  empty(): void {
    this.children = [];
    this.text = "";
  }

  addClass(cls: string): void {
    this.cls = [this.cls, cls].filter(Boolean).join(" ");
  }

  removeClass(cls: string): void {
    this.cls = this.cls
      .split(/\s+/)
      .filter((value) => value && value !== cls)
      .join(" ");
  }

  addEventListener(_event: string, _cb: (...args: never[]) => unknown): void {
    // no-op test double
  }

  focus(): void {
    // no-op test double
  }

  onClickEvent(cb: () => void | Promise<void>): void {
    this.onclick = cb;
  }

  createDiv(opts?: { cls?: string; text?: string }): FakeElement {
    return this.createEl("div", opts);
  }

  createEl(
    tag: string,
    opts?: { cls?: string; text?: string; type?: string; placeholder?: string; title?: string },
  ): FakeElement {
    const el = new FakeElement(tag);
    el.parent = this;
    el.cls = opts?.cls ?? "";
    el.text = opts?.text ?? "";
    el.type = opts?.type ?? "";
    el.placeholder = opts?.placeholder ?? "";
    el.title = opts?.title ?? "";
    this.children.push(el);
    return el;
  }

  createSpan(opts?: { cls?: string; text?: string }): FakeElement {
    return this.createEl("span", opts);
  }

  setText(text: string): void {
    this.text = text;
  }

  set innerHTML(value: string) {
    this.text = value.replace(/<[^>]+>/g, "");
  }

  get innerHTML(): string {
    return this.text;
  }

  appendChild(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "span:last-child") {
      const spans = this.children.filter((child) => child.tag === "span");
      return spans.at(-1) ?? null;
    }
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return this.find((child) => child.cls.split(/\s+/).includes(cls));
    }
    return this.find((child) => child.tag === selector);
  }

  get textContent(): string {
    return [this.text, ...this.children.map((child) => child.textContent)].join("");
  }

  private find(predicate: (child: FakeElement) => boolean): FakeElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const match = child.find(predicate);
      if (match) return match;
    }
    return null;
  }
}

export class Modal {
  modalEl = new FakeElement("modal");
  contentEl = new FakeElement("content");

  constructor(readonly app: unknown) {}

  open(): void {
    this.onOpen();
    openedModals.push(this);
  }

  onOpen(): void {
    // no-op test double
  }

  close(): void {
    this.onClose();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class PluginSettingTab {
  containerEl = new FakeElement("settings");

  constructor(
    readonly app: unknown,
    readonly plugin: unknown,
  ) {}

  display(): void {
    // no-op test double
  }
}

export class SuggestModal<T> extends Modal {
  emptyStateText = "";
  placeholder = "";

  setPlaceholder(text: string): void {
    this.placeholder = text;
  }

  getSuggestions(_query: string): T[] {
    return [];
  }

  renderSuggestion(_value: T, _el: HTMLElement): void {
    // no-op test double
  }

  onChooseSuggestion(_value: T): void {
    // no-op test double
  }
}

export class Setting {
  readonly settingEl: FakeElement;

  constructor(private readonly parent: FakeElement) {
    this.settingEl = this.parent.createDiv({ cls: "setting-item" });
  }

  setName(text: string): Setting {
    this.settingEl.createDiv({ cls: "setting-item-name", text });
    return this;
  }

  setDesc(text: string): Setting {
    this.settingEl.createDiv({ cls: "setting-item-description", text });
    return this;
  }

  addButton(cb: (button: SettingButton) => unknown): Setting {
    const buttonEl = this.settingEl.createEl("button");
    cb(new SettingButton(buttonEl));
    return this;
  }

  addDropdown(cb: (dropdown: DropdownComponent) => unknown): Setting {
    const selectEl = this.settingEl.createEl("select");
    cb(new DropdownComponent(selectEl));
    return this;
  }

  addText(cb: (text: TextComponent) => unknown): Setting {
    const inputEl = this.settingEl.createEl("input", { type: "text" });
    cb(new TextComponent(inputEl));
    return this;
  }

  addSlider(cb: (slider: SliderComponent) => unknown): Setting {
    const inputEl = this.settingEl.createEl("input", { type: "range" });
    cb(new SliderComponent(inputEl));
    return this;
  }

  addExtraButton(cb: (button: ExtraButtonComponent) => unknown): Setting {
    const buttonEl = this.settingEl.createEl("button");
    cb(new ExtraButtonComponent(buttonEl));
    return this;
  }
}

class SettingButton {
  constructor(private readonly el: FakeElement) {}

  setButtonText(text: string): SettingButton {
    this.el.text = text;
    return this;
  }

  setCta(): SettingButton {
    return this;
  }

  onClick(cb: () => void | Promise<void>): SettingButton {
    this.el.onclick = cb;
    return this;
  }
}

class DropdownComponent {
  constructor(private readonly el: FakeElement) {}

  addOption(value: string, text: string): DropdownComponent {
    const option = this.el.createEl("option", { text });
    option.value = value;
    return this;
  }

  setValue(value: string): DropdownComponent {
    this.el.value = value;
    return this;
  }

  onChange(cb: (value: string) => void | Promise<void>): DropdownComponent {
    this.el.onchange = () => cb(this.el.value);
    return this;
  }
}

class TextComponent {
  constructor(private readonly el: FakeElement) {}

  setPlaceholder(text: string): TextComponent {
    this.el.placeholder = text;
    return this;
  }

  setValue(value: string): TextComponent {
    this.el.value = value;
    return this;
  }

  onChange(cb: (value: string) => void | Promise<void>): TextComponent {
    this.el.onchange = () => cb(this.el.value);
    return this;
  }
}

class SliderComponent {
  constructor(private readonly el: FakeElement) {}

  setLimits(_min: number, _max: number, _step: number): SliderComponent {
    return this;
  }

  setDynamicTooltip(): SliderComponent {
    return this;
  }

  setValue(value: number): SliderComponent {
    this.el.value = String(value);
    return this;
  }

  onChange(cb: (value: number) => void | Promise<void>): SliderComponent {
    this.el.onchange = () => cb(Number(this.el.value));
    return this;
  }
}

class ExtraButtonComponent {
  constructor(private readonly el: FakeElement) {}

  setIcon(icon: string): ExtraButtonComponent {
    this.el.text = icon;
    return this;
  }

  setTooltip(text: string): ExtraButtonComponent {
    this.el.title = text;
    return this;
  }

  onClick(cb: () => void | Promise<void>): ExtraButtonComponent {
    this.el.onclick = cb;
    return this;
  }
}

export class Notice {
  constructor(message: string, timeoutMs?: number) {
    notices.push({ message, timeoutMs });
  }
}

export function addIcon(): void {
  // no-op test double
}

export function setIcon(): void {
  // no-op test double
}
