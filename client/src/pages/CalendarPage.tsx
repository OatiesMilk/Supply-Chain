import React from 'react';
import DeliveryCalendar from '@/features/deliveries/DeliveryCalendar';
import { DeliveryRecord } from '@/types';

export interface CalendarPageProps {
  records: DeliveryRecord[];
  onNavigate: (screen: string, item_id?: string) => void;
}

export const CalendarPage: React.FC<CalendarPageProps> = ({
  records,
  onNavigate,
}) => {
  return (
    <DeliveryCalendar
      records={records}
      onNavigate={onNavigate}
    />
  );
};

export default CalendarPage;
