import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'public', 'index.html'), 'utf8');
const pageScript = pageSource.match(/<script>([\s\S]*?)<\/script>/)[1];

const GAME = 'game_terminal';
const T0 = 1_800_000_000_000;

function createDOMContext() {
  const elements = new Map();
  const doc = { activeElement: null };
  const makeNode = (id = '', tagName = 'div') => {
    let text = '';
    const node = {
      id, tagName, parentNode: null, children: [], value: '', disabled: false, hidden: false, title: '', className: '', placeholder: '', checked: false,
      dataset: {}, style: {}, attributes: {}, listeners: {},
      classList: {
        classes: new Set(),
        add(...t) { for (const x of t) this.classes.add(x); },
        remove(...t) { for (const x of t) this.classes.delete(x); },
        toggle(c, f) { const on = f === undefined ? !this.classes.has(c) : f; if (on) this.classes.add(c); else this.classes.delete(c); return on; },
        contains(c) { return this.classes.has(c); }
      },
      addEventListener(e, fn) { (this.listeners[e] = this.listeners[e] || []).push(fn); },
      setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { child.parentNode?.children && (child.parentNode.children = child.parentNode.children.filter((c) => c !== child)); child.parentNode = this; this.children.push(child); return child; },
      append(...kids) { for (const kid of kids) this.appendChild(kid); },
      remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } },
      contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; },
      closest(selector) {
        if (selector !== '.player[data-instance-id]') throw new Error(`stub closest does not support ${selector}`);
        for (let n = this; n; n = n.parentNode) if (n.className === 'player' && n.dataset.instanceId) return n;
        return null;
      },
      focus() { doc.activeElement = this; },
      blur() {},
      scrollIntoView() {}
    };
    Object.defineProperty(node, 'textContent', { get: () => text, set: (v) => { text = String(v); } });
    Object.defineProperty(node, 'innerHTML', { get: () => '', set: (v) => { for (const c of node.children) c.parentNode = null; node.children = []; } });
    return node;
  };

  const getOrCreate = (id) => {
    let el = elements.get(id);
    if (!el) { el = makeNode(id); elements.set(id, el); }
    return el;
  };

  const storageMap = new Map();
  const fakeSessionStorage = {
    getItem: (k) => storageMap.has(k) ? storageMap.get(k) : null,
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear()
  };

  return { elements, getOrCreate, makeNode, fakeSessionStorage };
}

console.log('Setup verified');
