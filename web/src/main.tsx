import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Loading } from './components/ui';
import './index.css';
import Book from './pages/Book';
import Home from './pages/Home';
import ManageBooking from './pages/ManageBooking';

// Admin pages (and the Firebase SDK) load only when /admin is opened.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Bookings = lazy(() => import('./pages/admin/Bookings'));
const EventTypes = lazy(() => import('./pages/admin/EventTypes'));
const Availability = lazy(() => import('./pages/admin/Availability'));
const Settings = lazy(() => import('./pages/admin/Settings'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/booking/:id" element={<ManageBooking />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Bookings />} />
            <Route path="event-types" element={<EventTypes />} />
            <Route path="availability" element={<Availability />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/:slug" element={<Book />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
