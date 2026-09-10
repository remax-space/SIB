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
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive ring-1 ring-destructive/30">
        <ShieldOff className="h-3 w-3" /> REVOGADA
      </span>
    );
  }
  if (lic.fingerprint) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-success/30">
        <ShieldCheck className="h-3 w-3" /> ATIVA · TRAVADA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning ring-1 ring-warning/30">
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
          <h1 className="text-2xl font-bold text-foreground">Licenças de Máquina</h1>
          <p className="text-sm text-muted-foreground">
            Cada licença trava na primeira máquina que a ativar. Copiada para outro computador, não funcionará.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-nav-border bg-surface p-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Gerar nova licença
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Identificação (ex.: Notebook do escritório, PC casa)"
            className="flex-1 rounded-lg border border-nav-border bg-field px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            onClick={createLicense}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-nav-border bg-nav px-5 py-2.5 text-sm font-semibold text-nav-foreground transition hover:bg-nav-hover disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            GERAR LICENÇA
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando licenças...
          </div>
        ) : licenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nav-border bg-surface/50 py-16 text-center text-muted-foreground">
            Nenhuma licença gerada ainda. Crie a primeira acima.
          </div>
        ) : (
          licenses.map((lic) => (
            <div key={lic.id} className="rounded-2xl border border-nav-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-foreground">
                      {lic.label || 'Licença sem identificação'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded-md bg-field px-3 py-1.5 font-mono text-sm tracking-wider text-primary ring-1 ring-nav-border">
                      {lic.key}
                    </code>
                    <button
                      onClick={() => copyKey(lic)}
                      className="inline-flex items-center gap-1 rounded-md border border-nav-border bg-nav px-2.5 py-1.5 text-xs font-medium text-nav-foreground transition hover:bg-nav-hover"
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

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-nav-border/60 pt-4">
                {lic.fingerprint && !lic.revoked && (
                  <button
                    onClick={() => action(lic.id, { action: 'reset' })}
                    disabled={busyId === lic.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-nav-border bg-nav px-3 py-1.5 text-xs font-medium text-nav-foreground transition hover:bg-nav-hover disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Liberar máquina
                  </button>
                )}
                {lic.revoked ? (
                  <button
                    onClick={() => action(lic.id, { action: 'reactivate' })}
                    disabled={busyId === lic.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/20 disabled:opacity-60"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Reativar
                  </button>
                ) : (
                  <button
                    onClick={() => action(lic.id, { action: 'revoke' })}
                    disabled={busyId === lic.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition hover:bg-warning/20 disabled:opacity-60"
                  >
                    <ShieldOff className="h-3.5 w-3.5" /> Revogar
                  </button>
                )}
                <button
                  onClick={() => remove(lic.id)}
                  disabled={busyId === lic.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/20 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
                {busyId === lic.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
