'use client';

import { useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  ShieldOff,
  ShieldCheck,
  RotateCcw,
  Trash2,
  Loader2,
  Monitor,
  MonitorSmartphone,
} from 'lucide-react';

interface License {
  id: string;
  key: string;
  label: string | null;
  fingerprint: string | null;
  active: boolean;
  revoked: boolean;
  activatedAt: string | null;
  lastSeenAt: string | null;
  notes: string | null;
  createdAt: string;
}

function StatusBadge({ lic }: { lic: License }) {
  if (lic.revoked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400 ring-1 ring-red-500/30">
        <ShieldOff className="h-3 w-3" /> REVOGADA
      </span>
    );
  }
  if (lic.fingerprint) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
        <ShieldCheck className="h-3 w-3" /> ATIVA · TRAVADA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-500/30">
      <MonitorSmartphone className="h-3 w-3" /> AGUARDANDO 1º ACESSO
    </span>
  );
}

export function LicencasClient() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/licenses');
      if (res.ok) {
        const data = await res.json();
        setLicenses(data.licenses ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createLicense() {
    setCreating(true);
    try {
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || null }),
      });
      if (res.ok) {
        setLabel('');
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, body: any) {
    setBusyId(id);
    try {
      await fetch(`/api/licenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta licença permanentemente? Esta ação não pode ser desfeita.')) return;
    setBusyId(id);
    try {
      await fetch(`/api/licenses/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function copyKey(lic: License) {
    navigator.clipboard.writeText(lic.key);
    setCopiedId(lic.id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Licenças de Máquina</h1>
          <p className="text-sm text-slate-400">
            Cada licença trava na primeira máquina que a ativar. Copiada para outro computador, não funcionará.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#24456b] bg-[#141b28] p-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Gerar nova licença
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Identificação (ex.: Notebook do escritório, PC casa)"
            className="flex-1 rounded-lg border border-[#24456b] bg-[#0D0F14] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
          <button
            onClick={createLicense}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#24456b] bg-[#16304f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1c3b60] disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            GERAR LICENÇA
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando licenças...
          </div>
        ) : licenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#24456b] bg-[#141b28]/50 py-16 text-center text-slate-400">
            Nenhuma licença gerada ainda. Crie a primeira acima.
          </div>
        ) : (
          licenses.map((lic) => (
            <div key={lic.id} className="rounded-2xl border border-[#24456b] bg-[#141b28] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-slate-400" />
                    <span className="font-semibold text-white">
                      {lic.label || 'Licença sem identificação'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded-md bg-[#0D0F14] px-3 py-1.5 font-mono text-sm tracking-wider text-primary ring-1 ring-[#24456b]">
                      {lic.key}
                    </code>
                    <button
                      onClick={() => copyKey(lic)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#24456b] bg-[#16304f] px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#1c3b60]"
                    >
                      {copiedId === lic.id ? (
                        <><Check className="h-3.5 w-3.5" /> Copiado</>
                      ) : (
                        <><Copy className="h-3.5 w-3.5" /> Copiar</>
                      )}
                    </button>
                  </div>
                </div>
                <StatusBadge lic={lic} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#24456b]/60 pt-4">
                {lic.fingerprint && !lic.revoked && (
                  <button
                    onClick={() => action(lic.id, { action: 'reset' })}
                    disabled={busyId === lic.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#24456b] bg-[#16304f] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#1c3b60] disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Liberar máquina
                  </button>
                )}
                {lic.revoked ? (
                  <button
                    onClick={() => action(lic.id, { action: 'reactivate' })}
                    disabled={busyId === lic.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Reativar
                  </button>
                ) : (
                  <button
                    onClick={() => action(lic.id, { action: 'revoke' })}
                    disabled={busyId === lic.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 transition hover:bg-amber-500/20 disabled:opacity-60"
                  >
                    <ShieldOff className="h-3.5 w-3.5" /> Revogar
                  </button>
                )}
                <button
                  onClick={() => remove(lic.id)}
                  disabled={busyId === lic.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
                {busyId === lic.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
