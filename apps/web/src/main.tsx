import { StrictMode } from 'react';
import { RouterProvider } from 'react-router';
import * as ReactDOM from 'react-dom/client';
import { appRouter } from './app/app-router';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <RouterProvider router={appRouter}/>
  </StrictMode>,
);
