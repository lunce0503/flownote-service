type DraftWorkerRequest = {
  requestId: string;
  lines: Array<{ status?: string }>;
  images: Array<{ status?: string }>;
  textBoxes: Array<{ status?: string }>;
  baseRevision?: number;
};

self.onmessage = (event: MessageEvent<DraftWorkerRequest>) => {
  const { requestId, lines, images, textBoxes, baseRevision } = event.data;
  const hasPendingChanges = [...lines, ...images, ...textBoxes]
    .some((item) => item.status && item.status !== "unchanged");
  self.postMessage({
    requestId,
    draft: {
      lines,
      images,
      textBoxes,
      updatedAt: Date.now(),
      hasPendingChanges,
      baseRevision,
    },
  });
};

export {};
