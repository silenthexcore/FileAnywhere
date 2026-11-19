import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const MenuCloseContext = createContext<() => void>(() => undefined);

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label">{children}</div>;
}

export function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}

interface MenuItemProps {
  icon?: ReactNode;
  label: ReactNode;
  shortcut?: string;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  keepOpen?: boolean;
}

export function MenuItem({
  icon,
  label,
  shortcut,
  selected,
  danger,
  disabled,
  onSelect,
  keepOpen,
}: MenuItemProps) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item${danger ? ' is-danger' : ''}${selected ? ' is-selected' : ''}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onSelect?.();
        if (!keepOpen) close();
      }}
    >
      {icon && <span className="menu-item-icon">{icon}</span>}
      <span className="menu-item-label">{label}</span>
      {shortcut && <span className="menu-item-shortcut">{shortcut}</span>}
      {selected && <span className="menu-item-check" aria-hidden="true" />}
    </button>
  );
}

interface Pendulum {
  anchorRect?: DOMRect;
  point?: { x: number; y: number };
}

function useFloatingPosition(
  open: boolean,
  menuRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLElement | null>,
  anchorRect: DOMRect | undefined,
  point: { x: number; y: number } | undefined,
  align: 'start' | 'end',
) {
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const anchor = anchorRect || anchorRef.current?.getBoundingClientRect();
    if (!menu) return;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const margin = 8;
    let top: number;
    let left: number;
    if (point) {
      left = Math.min(Math.max(point.x, margin), window.innerWidth - width - margin);
      top = point.y + height + margin > window.innerHeight ? point.y - height : point.y;
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    } else if (anchor) {
      top = anchor.bottom + 6;
      if (top + height + margin > window.innerHeight) top = Math.max(margin, anchor.top - height - 6);
      left = align === 'end' ? anchor.right - width : anchor.left;
      left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
    } else {
      return;
    }
    setStyle({ position: 'fixed', top, left, visibility: 'visible' });
  }, [open, menuRef, anchorRef, anchorRect, point, align]);

  return style;
}

function FloatingMenu({
  open,
  onClose,
  anchorRef,
  anchorRect,
  point,
  align = 'end',
  width,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  anchorRect?: DOMRect;
  point?: { x: number; y: number };
  align?: 'start' | 'end';
  width?: number;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const style = useFloatingPosition(open, menuRef, anchorRef, anchorRect, point, align);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <MenuCloseContext.Provider value={onClose}>
      <div
        ref={menuRef}
        className="menu"
        role="menu"
        style={{ ...style, width: width ? `${width}px` : undefined }}
      >
        {children}
      </div>
    </MenuCloseContext.Provider>,
    document.body,
  );
}

interface DropdownMenuProps {
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  width,
  className,
  disabled,
  onOpenChange,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const updateOpen = (next: boolean) => {
    if (disabled) return;
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (disabled && open) updateOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <>
      <div
        ref={anchorRef}
        className={`menu-anchor ${className || ''}`}
        onClick={() => updateOpen(!open)}
      >
        {trigger}
      </div>
      <FloatingMenu
        open={open}
        onClose={() => updateOpen(false)}
        anchorRef={anchorRef}
        align={align}
        width={width}
      >
        {children}
      </FloatingMenu>
    </>
  );
}

interface ContextMenuProps {
  open: boolean;
  at: { x: number; y: number } | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function ContextMenu({ open, at, onClose, children, width }: ContextMenuProps) {
  const anchorRef = useRef<HTMLElement>(null);
  return (
    <FloatingMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      point={at || undefined}
      width={width}
    >
      {children}
    </FloatingMenu>
  );
}
