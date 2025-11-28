import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import type { TileData } from '../types';
import { CSS } from '@dnd-kit/utilities';
import { motionTokens } from '@kse/ui';
import { useState } from 'react';

type Props = {
  tiles: TileData[];
  order: string[];
  onOrderChange: (order: string[]) => void;
};

export function TileWall({ tiles, order, onOrderChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const tileMap = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
  const orderedTiles = order.map((id) => tileMap[id]).filter(Boolean);
  const [activeId, setActiveId] = useState<string | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active?.id && over?.id && active.id !== over.id) {
      const activeKey = String(active.id);
      const overKey = String(over.id);
      const oldIndex = order.indexOf(activeKey);
      const newIndex = order.indexOf(overKey);
      const next = arrayMove(order, oldIndex, newIndex);
      onOrderChange(next);
    }
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => {
        const id = event.active?.id;
        setActiveId(typeof id === 'string' ? id : id != null ? String(id) : null);
      }}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={orderedTiles.map((tile) => tile.id)} strategy={rectSortingStrategy}>
        <div className="grid-wall">
          {orderedTiles.map((tile) => (
            <SortableTile key={tile.id} tile={tile} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId && tileMap[activeId] ? (
          <div className="rounded-3xl border border-white/20 bg-white/10 p-4 backdrop-blur min-w-[260px]">
            <TileContent tile={tileMap[activeId]!} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableTile({ tile }: { tile: TileData }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tile.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    boxShadow: motionTokens.shadows.card
  };
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="rounded-3xl border border-white/5 bg-white/5 p-4 backdrop-blur cursor-grab active:cursor-grabbing"
    >
      <TileContent tile={tile} />
    </article>
  );
}

function TileContent({ tile }: { tile: TileData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.5em] text-slate-400">{tile.category}</p>
        <span className="text-[11px] font-semibold text-white/60">{tile.summary}</span>
      </div>
      <h3 className="text-xl font-semibold text-white">{tile.title}</h3>
      <div className="space-y-2">
        {tile.metrics.map((metric) => (
          <div key={metric.label} className="flex items-baseline justify-between gap-2">
            <span className="text-xs tracking-[0.4em] uppercase text-slate-400">{metric.label}</span>
            <span className="text-lg font-semibold">{metric.value}</span>
            {metric.trend && <span className="text-xs text-emerald-400">{metric.trend}</span>}
          </div>
        ))}
      </div>
      <a
        href={tile.link}
        className="inline-flex text-xs uppercase tracking-[0.4em] text-sky-300 hover:text-sky-100 transition"
      >
        Launch →
      </a>
    </div>
  );
}

