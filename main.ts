import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const I32 = (x: number) => x | 0;
const u32 = (x: number) => x >>> 0;

function run(prog: Buffer, inp: Buffer): { out: number[]; exit: number } {
  const out: number[] = [];
  const mem = new Int32Array(256);
  const stack = new Int32Array(256);
  const call = new Int32Array(64);
  let sp = 0, cp = 0, pc = 0, ip = 0, steps = 0;
  const push = (v: number) => { stack[sp++] = I32(v); };
  const pop = () => stack[--sp];
  const need = (n: number, p = 0): number | null => {
    if (sp < n) return 2;
    if (sp - n + p > 256) return 3;
    return null;
  };
  while (true) {
    if (steps >= 1_000_000) return { out, exit: 10 };
    if (pc < 0 || pc >= prog.length) return { out, exit: 9 };
    const op = prog[pc];
    const imm = (n: number): number => {
      if (pc + n >= prog.length) return -1;
      let v = 0, s = 1;
      for (let i = 0; i < n; i++, s *= 256) v += prog[pc + 1 + i] * s;
      return v;
    };
    let a: number, b: number, c: number, v: number, o: number | null;
    const fail = (code: number) => ({ out, exit: code });
    switch (op) {
      case 0x00: return { out, exit: 0 };
      case 0x01: o = imm(1); if (o < 0) return fail(9); push((o << 24) >> 24); pc += 2; break;
      case 0x02: o = imm(4); if (o < 0) return fail(9); push(o | 0); pc += 5; break;
      case 0x03: o = need(1); if (o) return fail(o); sp--; pc++; break;
      case 0x04: o = need(1, 1); if (o) return fail(o); push(stack[sp - 1]); pc++; break;
      case 0x05: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(b); push(a); pc++; break;
      case 0x06: o = need(2, 1); if (o) return fail(o); push(stack[sp - 2]); pc++; break;
      case 0x07: o = need(3); if (o) return fail(o); c = pop(); b = pop(); a = pop(); push(b); push(c); push(a); pc++; break;
      case 0x10: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a + b)); pc++; break;
      case 0x11: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a - b)); pc++; break;
      case 0x12: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(Math.imul(a, b)); pc++; break;
      case 0x13: o = need(2); if (o) return fail(o); b = pop(); a = pop(); if (b === 0) return fail(4); push(a === -2147483648 && b === -1 ? -2147483648 : I32(a / b | 0)); pc++; break;
      case 0x14: o = need(2); if (o) return fail(o); b = pop(); a = pop(); if (b === 0) return fail(4); push(b === -1 ? 0 : I32(a % b)); pc++; break;
      case 0x15: o = need(2); if (o) return fail(o); b = u32(pop()); a = u32(pop()); if (b === 0) return fail(4); push(I32(a / b | 0)); pc++; break;
      case 0x16: o = need(2); if (o) return fail(o); b = u32(pop()); a = u32(pop()); if (b === 0) return fail(4); push(I32(a % b)); pc++; break;
      case 0x17: o = need(1); if (o) return fail(o); push(I32(-pop())); pc++; break;
      case 0x18: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a & b)); pc++; break;
      case 0x19: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a | b)); pc++; break;
      case 0x1a: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a ^ b)); pc++; break;
      case 0x1b: o = need(1); if (o) return fail(o); push(I32(~pop())); pc++; break;
      case 0x1c: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a << (b & 31))); pc++; break;
      case 0x1d: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(a >> (b & 31))); pc++; break;
      case 0x1e: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(I32(u32(a) >>> (b & 31))); pc++; break;
      case 0x20: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(a === b ? 1 : 0); pc++; break;
      case 0x21: o = need(2); if (o) return fail(o); b = pop(); a = pop(); push(a < b ? 1 : 0); pc++; break;
      case 0x22: o = need(2); if (o) return fail(o); b = u32(pop()); a = u32(pop()); push(a < b ? 1 : 0); pc++; break;
      case 0x30:
      case 0x31:
      case 0x32:
      case 0x33: {
        o = imm(2); if (o < 0) return fail(9);
        let off = o;
        if (op !== 0x33 && off >= 0x8000) off -= 0x10000;
        const next = pc + 3;
        if (op === 0x33) {
          if (cp >= 64) return fail(7);
          call[cp++] = next;
          pc = off;
        } else if (op === 0x30) {
          pc = next + off;
        } else {
          o = need(1); if (o) return fail(o);
          v = pop();
          pc = (op === 0x31 ? v === 0 : v !== 0) ? next + off : next;
        }
        break;
      }
      case 0x34: if (cp <= 0) return fail(8); pc = call[--cp]; break;
      case 0x40: o = need(1); if (o) return fail(o); a = pop(); if (a < 0 || a > 255) return fail(6); push(mem[a]); pc++; break;
      case 0x41: o = need(2); if (o) return fail(o); a = pop(); v = pop(); if (a < 0 || a > 255) return fail(6); mem[a] = I32(v); pc++; break;
      case 0x50: o = need(1); if (o) return fail(o); v = pop(); const s = String(v); if (out.length + s.length > 65536) return fail(11); for (const c of s) out.push(c.charCodeAt(0)); pc++; break;
      case 0x51: o = need(1); if (o) return fail(o); if (out.length >= 65536) return fail(11); out.push(pop() & 255); pc++; break;
      case 0x52: o = need(0, 1); if (o) return fail(o); push(ip < inp.length ? inp[ip++] : -1); pc++; break;
      case 0x53: o = need(1); if (o) return fail(o); return { out, exit: pop() & 255 };
      default: return fail(5);
    }
    steps++;
  }
}

const ids = readdirSync("/input");
mkdirSync("/output", { recursive: true });
for (const id of ids) {
  const dir = join("/input", id);
  try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
  const prog = readFileSync(join(dir, "program.bin"));
  let inp: Buffer;
  try { inp = readFileSync(join(dir, "input.bin")); } catch { inp = Buffer.alloc(0); }
  const res = run(prog, inp);
  const outDir = join("/output", id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "stdout.bin"), Buffer.from(res.out));
  writeFileSync(join(outDir, "exit.txt"), String(res.exit) + "\n");
}
