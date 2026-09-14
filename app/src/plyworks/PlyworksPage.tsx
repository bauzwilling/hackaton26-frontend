import { Configurator } from "./components/Configurator";
import { JointWizPage } from "./components/JointWizPage";
import { NestingPage } from "./components/NestingPage";
import { parseDesignId, type DesignId } from "./lib/designs";

interface PlyworksPageProps {
  design?: string;
  helpActive?: boolean;
  onHelpReady?: () => void;
  onHelpDone?: () => void;
  onOpenDesign: (design: DesignId) => void;
  onOpenJointWiz: (jobId: string) => void;
  onOpenNesting: (jobId: string) => void;
}

export function PlyworksPage({ design, ...props }: PlyworksPageProps) {
  return <Configurator design={parseDesignId(design)} {...props} />;
}

export function PlyworksJwPage({
  jobId,
  onOpenNesting,
}: {
  jobId?: string;
  onOpenNesting: (jobId: string) => void;
}) {
  return <JointWizPage jobId={jobId} onOpenNesting={onOpenNesting} />;
}

export function PlyworksNestingPage({ jobId }: { jobId?: string }) {
  return <NestingPage jobId={jobId} />;
}
