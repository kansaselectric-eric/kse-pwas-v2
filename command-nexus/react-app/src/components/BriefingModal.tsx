import * as Dialog from '@radix-ui/react-dialog';
import { CinematicCard, GlowButton } from '@kse/ui';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: string[];
  commodities: Array<{ name: string; status: string; message: string }>;
};

export function BriefingModal({ open, onOpenChange, notes, commodities }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/80 backdrop-blur z-40" />
        <Dialog.Content className="fixed inset-x-0 top-10 mx-auto max-w-3xl z-50">
          <CinematicCard accent="#7c3aed" className="shadow-[0_45px_60px_rgba(15,23,42,.45)] min-h-[420px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.5em] text-white/70">Executive Briefing</p>
                <h2 className="text-3xl font-semibold mt-2">Kansas Electric Command Update</h2>
              </div>
              <Dialog.Close asChild>
                <button className="text-white/60 hover:text-white text-sm uppercase tracking-[0.4em]">Close</button>
              </Dialog.Close>
            </div>
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              <div>
                <h3 className="text-sm uppercase tracking-[0.4em] text-white/60 mb-2">Highlights</h3>
                <ul className="space-y-3 text-sm text-white/90">
                  {notes.slice(0, 5).map((note, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="text-white/30">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-[0.4em] text-white/60 mb-2">Commodity Watch</h3>
                <div className="space-y-3">
                  {commodities.map((item) => (
                    <div
                      key={item.name}
                      className="bg-white/10 border border-white/15 rounded-2xl px-4 py-3 flex items-start gap-3"
                    >
                      <span
                        className={`text-xs uppercase tracking-[0.4em] ${
                          item.status === 'surging'
                            ? 'text-rose-300'
                            : item.status === 'elevated'
                            ? 'text-amber-200'
                            : 'text-emerald-200'
                        }`}
                      >
                        {item.status}
                      </span>
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-sm text-white/80">{item.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <GlowButton>Export PDF</GlowButton>
              <GlowButton variant="ghost">Share to Teams</GlowButton>
              <GlowButton variant="ghost">Copy Summary</GlowButton>
            </div>
          </CinematicCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

