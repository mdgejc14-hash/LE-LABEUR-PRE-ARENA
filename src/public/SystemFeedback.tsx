import { StateGuard, type StateGuardProps } from '../design-system/components/StateGuard';
import { navigate } from '../routing/navigation';

/** Never render catalogue actions that would pretend to create a queue, job or appeal. */
export function SystemFeedback({ retry, back, ...props }: Omit<StateGuardProps, 'actions' | 'onExitAction'> & {
  retry?: () => void;
  back?: () => void;
}) {
  return <StateGuard {...props} actions={[
    ...(props.state === '401' ? [{ label: 'Se reconnecter', onClick: () => navigate('/connexion') }] : []),
    ...(retry && ['offline', '500', '502', '504'].includes(props.state)
      ? [{ label: 'Réessayer', onClick: retry }] : []),
    { label: 'Revenir', variant: 'ghost', onClick: back ?? (() => navigate('/accueil')) },
  ]} />;
}
