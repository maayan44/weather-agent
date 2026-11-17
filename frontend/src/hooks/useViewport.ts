import { useEffect, useState } from "react";

// On iPhone the on-screen keyboard covers the bottom of the page without resizing it, which would hide the
// message box. The visual viewport is the part actually visible, so the layout follows that instead.
const KEYBOARD_MIN_HEIGHT_PX = 150;

export function useViewport() {
  const [viewport, setViewport] = useState<{ height: number | null; keyboardOpen: boolean }>({ height: null, keyboardOpen: false });

  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;

    const update = () => {
      setViewport({ height: visual.height, keyboardOpen: window.innerHeight - visual.height > KEYBOARD_MIN_HEIGHT_PX });
      // Safari scrolls the page when the keyboard opens; the layout already fits, so put the page back.
      window.scrollTo(0, 0);
    };

    update();
    visual.addEventListener("resize", update);
    return () => visual.removeEventListener("resize", update);
  }, []);

  return viewport;
}
