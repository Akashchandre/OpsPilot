import { ToastContainer } from "react-toastify";

export function AppToaster() {
  return (
    <ToastContainer
      aria-label="Action notifications"
      position="top-right"
      autoClose={3600}
      closeOnClick
      newestOnTop
      pauseOnFocusLoss
      pauseOnHover
      draggable="touch"
      limit={4}
      role="status"
      theme="dark"
    />
  );
}
