import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { PageTransition } from '@/components/shared/PageTransition';
import { ConnectionStatus } from '@/components/ConnectionStatus';

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex flex-1 pt-navbar">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 min-w-0 md:ml-sidebar-collapsed lg:ml-sidebar transition-[margin] duration-200">
          <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      <ConnectionStatus />
    </div>
  );
}

export default AppShell;
