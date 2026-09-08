export function createViewerScene(container: HTMLElement): {
  showDoc(doc: unknown): Promise<void>;
  clearSceneMeshes(): void;
  resize(): void;
  dispose(): void;
};
