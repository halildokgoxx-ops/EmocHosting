import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export function NotificationBridge() {
  const { firebaseUser, refreshProfile } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!firebaseUser) return;
    let socket = null;
    let disposed = false;

    auth.currentUser?.getIdToken().then((token) => {
      if (disposed || !token) return;
      socket = io('/', { auth: { token } });
      socket.on('notification:new', (notif) => {
        if (!notif) return;
        const msg = `${notif.title}${notif.message ? ' — ' + notif.message : ''}`;
        if (notif.type === 'giveaway_win' || notif.type === 'wallet') {
          toast.success(msg);
          refreshProfile();
        } else if (notif.type === 'server_power') {
          toast.info(msg);
        } else {
          toast.info(msg);
        }

        window.dispatchEvent(new CustomEvent('emoc:notification', { detail: notif }));

        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          document.hidden
        ) {
          try {
            new Notification(notif.title, {
              body: notif.message || '',
              icon: '/assets/lion-emblem.jpg',
            });
          } catch {}
        }
      });
    });

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [firebaseUser, refreshProfile, toast]);

  return null;
}
