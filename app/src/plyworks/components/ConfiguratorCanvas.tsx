import { useThreeEngine } from "../hooks/useThreeEngine";
import type { ConfiguratorStore } from "../hooks/useConfiguratorState";

interface Props {
  store: ConfiguratorStore;
}

export function ConfiguratorCanvas({ store }: Props) {
  const { containerRef } = useThreeEngine(store);

  return <div ref={containerRef} className="pw-canvas" />;
}
