import { useRef } from 'react'

/**
 * Props for a modal backdrop that dismisses on a click, but not on a drag
 * that merely finished over it.
 *
 * A bare `onClick` on the backdrop is wrong, and wrong in a way that only
 * shows up once there is text worth selecting. `click` fires on the nearest
 * common ancestor of where the button went down and where it came up, so
 * pressing inside a text field, sweeping past the dialog's edge and
 * releasing lands a click on the backdrop itself — a selection gesture that
 * throws the dialog away mid-edit. Stopping propagation inside the dialog
 * cannot help: the event was never dispatched there to begin with.
 *
 * So both ends of the gesture are checked instead, on the press and on the
 * release, and the dialog is dismissed only when neither touched it. That
 * also rules out the mirror case — pressing on the backdrop and releasing
 * inside the dialog, which is how a user drags a selection the other way.
 *
 * The arming flag is a ref rather than a closure variable because React may
 * re-render between the press and the release, which would otherwise hand
 * the second handler a fresh, unarmed copy.
 *
 * Because both ends are checked against `currentTarget`, the dialog this
 * wraps needs no `onClick` of its own to shield itself.
 *
 * @param {Function} close - Called when the backdrop is genuinely clicked.
 * @returns {{onMouseDown: Function, onMouseUp: Function}} Props to spread onto the backdrop element.
 * @sideEffect Allocates a ref on the calling component.
 */
export function useBackdropDismiss(close) {
  const armed = useRef(false)
  return {
    /**
     * Arm the dismissal only if the press landed on the backdrop itself.
     *
     * @param {MouseEvent} e - The press.
     * @returns {void}
     * @mutates the arming ref.
     */
    onMouseDown: (e) => { armed.current = e.target === e.currentTarget },
    /**
     * Dismiss, if this release and the press that began it were both on the backdrop.
     *
     * @param {MouseEvent} e - The release.
     * @returns {void}
     * @sideEffect Calls `close` when both ends of the gesture were on the backdrop.
     * @mutates the arming ref.
     */
    onMouseUp: (e) => {
      const hit = armed.current && e.target === e.currentTarget
      armed.current = false
      if (hit) close()
    },
  }
}
