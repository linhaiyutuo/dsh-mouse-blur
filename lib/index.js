/**
 * Host half of a browser-only plugin.
 *
 * All behaviour lives in `./client`: the browser client listens for mouse
 * activity and drives the background blur custom properties there. The host
 * still needs to load a package entry so that dsh-client-modules can compose
 * this package's `./client` bundle into the web boot graph.
 */
export function apply() {}
