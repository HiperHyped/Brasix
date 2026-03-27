function isTextInput(target) {
  if (!target) {
    return false;
  }
  const tagName = target.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function bindMapEditorShortcuts(handlers) {
  const listener = (event) => {
    if (isTextInput(event.target)) {
      return;
    }

    const lowerKey = String(event.key || "").toLowerCase();
    if (lowerKey === "v") {
      event.preventDefault();
      handlers.onSelectTool?.("tool_map_pan");
      return;
    }
    if (lowerKey === "r") {
      event.preventDefault();
      handlers.onSelectTool?.("tool_route_draw");
      return;
    }
    if (lowerKey === "1") {
      event.preventDefault();
      handlers.onSelectSurface?.("1");
      return;
    }
    if (lowerKey === "2") {
      event.preventDefault();
      handlers.onSelectSurface?.("2");
      return;
    }
    if (lowerKey === "3") {
      event.preventDefault();
      handlers.onSelectSurface?.("3");
      return;
    }
    if (lowerKey === "l") {
      event.preventDefault();
      handlers.onSelectGeometry?.("l");
      return;
    }
    if (lowerKey === "p") {
      event.preventDefault();
      handlers.onSelectGeometry?.("p");
      return;
    }
    if (lowerKey === "h") {
      event.preventDefault();
      handlers.onToggleHelp?.();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      handlers.onConfirm?.();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      handlers.onCancel?.();
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      handlers.onRemoveLastPoint?.();
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      handlers.onDeleteSelected?.();
    }
  };

  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}
