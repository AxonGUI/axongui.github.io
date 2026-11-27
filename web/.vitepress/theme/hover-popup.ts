/**
 * 代码块里的类型悬停浮层。
 *
 * 为什么不用 CSS 就地弹出：shiki 把浮层 HTML 塞在 `<pre>` 里的 token 旁边，而
 * `.vp-doc div[class*=language-]` 是 `overflow-x: auto` —— 浮层会被容器裁掉，
 * 而且它撑出来的宽度还会给代码块加上一条不该有的横向滚动条。
 *
 * 所以浮层在客户端「搬」到 body 上显示：hover 时读 token 旁边那份 HTML，用一个
 * fixed 定位的单例元素渲染，位置跟着 token 走、超出视口时自动翻转。
 */
let popup: HTMLElement | null = null;
let current: HTMLElement | null = null;
let installed = false;

function ensurePopup(): HTMLElement {
  if (popup) return popup;
  const el = document.createElement("div");
  el.className = "axon-hover-popup";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  document.body.appendChild(el);
  popup = el;
  return el;
}

function place(target: HTMLElement) {
  const el = ensurePopup();
  const rect = target.getBoundingClientRect();
  const margin = 8;
  el.hidden = false;
  el.style.left = "0px";
  el.style.top = "0px";
  const box = el.getBoundingClientRect();
  let left = rect.left;
  if (left + box.width > window.innerWidth - margin) left = window.innerWidth - margin - box.width;
  if (left < margin) left = margin;
  let top = rect.top - box.height - 6;
  if (top < margin) top = rect.bottom + 6;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function show(target: HTMLElement) {
  const source = target.querySelector(".twoslash-popup-container");
  if (!source) return;
  const el = ensurePopup();
  el.innerHTML = source.innerHTML;
  current = target;
  el.hidden = false;
  place(target);
}

function hide() {
  if (popup) popup.hidden = true;
  current = null;
}

export function installHoverPopup() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const isToken = (t: EventTarget | null): HTMLElement | null => {
    const node = t as HTMLElement | null;
    return node?.closest?.(".twoslash-hover") as HTMLElement | null;
  };
  document.addEventListener("mouseover", (ev) => {
    const token = isToken(ev.target);
    if (!token) return;
    if (current === token) return;
    show(token);
  });
  document.addEventListener("mouseout", (ev) => {
    const token = isToken(ev.target);
    if (!token) return;
    const to = ev.relatedTarget as HTMLElement | null;
    if (to && token.contains(to)) return;
    hide();
  });
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);
}
