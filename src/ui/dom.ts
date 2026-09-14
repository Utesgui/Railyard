type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  className?: string;
  id?: string;
  title?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
  onClick?: (ev: MouseEvent) => void;
  onInput?: (ev: Event) => void;
  onChange?: (ev: Event) => void;
  onKeyDown?: (ev: KeyboardEvent) => void;
  disabled?: boolean;
  type?: string;
  value?: string;
  placeholder?: string;
  checked?: boolean;
  min?: string;
  max?: string;
  step?: string;
  html?: string;
  attrs?: Record<string, string>;
}

function append(el: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
    return;
  }
  if (child instanceof Node) el.appendChild(child);
  else el.appendChild(document.createTextNode(String(child)));
}

/** Minimal element factory. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el: HTMLElement = document.createElement(tag);
  if (props) {
    if (props.className) el.className = props.className;
    if (props.id) el.id = props.id;
    if (props.title) el.title = props.title;
    if (props.style) Object.assign(el.style, props.style);
    if (props.dataset) for (const k of Object.keys(props.dataset)) el.dataset[k] = props.dataset[k];
    if (props.onClick) el.addEventListener('click', props.onClick);
    if (props.onInput) el.addEventListener('input', props.onInput);
    if (props.onChange) el.addEventListener('change', props.onChange);
    if (props.onKeyDown) el.addEventListener('keydown', props.onKeyDown);
    if (props.disabled !== undefined) (el as unknown as HTMLButtonElement).disabled = props.disabled;
    if (props.type !== undefined) (el as unknown as HTMLInputElement).type = props.type;
    if (props.value !== undefined) (el as unknown as HTMLInputElement).value = props.value;
    if (props.placeholder !== undefined) (el as unknown as HTMLInputElement).placeholder = props.placeholder;
    if (props.checked !== undefined) (el as unknown as HTMLInputElement).checked = props.checked;
    if (props.min !== undefined) (el as unknown as HTMLInputElement).min = props.min;
    if (props.max !== undefined) (el as unknown as HTMLInputElement).max = props.max;
    if (props.step !== undefined) (el as unknown as HTMLInputElement).step = props.step;
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.attrs) for (const k of Object.keys(props.attrs)) el.setAttribute(k, props.attrs[k]);
  }
  for (const c of children) append(el, c);
  return el as HTMLElementTagNameMap[K];
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function replace(el: Element, ...children: Child[]): void {
  clear(el);
  for (const c of children) append(el, c);
}

export function button(label: string, onClick: (ev: MouseEvent) => void, className = 'btn', title?: string): HTMLButtonElement {
  return h('button', { className, onClick, title }, label);
}

export function row(...children: Child[]): HTMLDivElement {
  return h('div', { className: 'row' }, ...children);
}

export function kv(key: string, valueEl: Node | string): HTMLDivElement {
  return h('div', { className: 'kv' }, h('span', { className: 'k' }, key), h('span', { className: 'v' }, valueEl));
}
