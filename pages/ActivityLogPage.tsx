
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { format } from 'date-fns';

const ActivityLogPage: React.FC = () => {
    const logs = useLiveQuery(() => 
        db.activityLogs.orderBy('timestamp').reverse().toArray()
    );

    return (
        <div className="animate-fadeIn">
            <h1 className="text-3xl font-bold mb-6">Activity Log</h1>

            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary-100 dark:bg-secondary-800/50">
                            <tr>
                                <th className="p-4">Timestamp</th>
                                <th className="p-4">User</th>
                                <th className="p-4">Action</th>
                                <th className="p-4">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs?.map(log => (
                                <tr key={log.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                    <td className="p-4 whitespace-nowrap text-secondary-500">
                                        {format(log.timestamp, 'MMM d, yyyy, h:mm a')}
                                    </td>
                                    <td className="p-4 font-medium">{log.username}</td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 text-xs font-semibold bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200 rounded-full">{log.action}</span>
                                    </td>
                                    <td className="p-4 text-secondary-600 dark:text-secondary-300">{log.details}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ActivityLogPage;
