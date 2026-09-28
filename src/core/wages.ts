/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Career Labor Converter & Vampire Drain Engine
 *
 * Converts abstract interest dollar amounts into concrete life metrics:
 * - Hours & days worked solely to pay bank profit
 * - Dead rent equivalent
 * - Monthly Freedom Day (when you stop working for the bank each month)
 */

import { Inputs, ScheduleRow, CareerLaborMetrics } from './types.js';

export const calculateCareerLabor = (
  inputs: Inputs,
  schedule: ScheduleRow[]
): CareerLaborMetrics => {
  const annualIncome = Math.max(10000, inputs.annualIncome || 100000);
  // Standard 2,000 work hours/year (40 hrs/wk * 50 weeks)
  const hourlyWage = annualIncome / 2000;
  const dailyWage = annualIncome / 250; // 250 working days/yr

  let totalInterest = 0;
  const annualInterestMap: Record<number, number> = {};

  schedule.forEach((row) => {
    totalInterest += row.interest;
    annualInterestMap[row.year] = (annualInterestMap[row.year] || 0) + row.interest;
  });

  const totalHoursWorkedForBank = Math.round((totalInterest / hourlyWage) * 10) / 10;
  const totalDaysWorkedForBank = Math.round((totalInterest / dailyWage) * 10) / 10;

  // Monthly Dead Rent (first year average monthly interest)
  const firstYearInterest = annualInterestMap[1] || totalInterest / Math.max(1, schedule.length / 12);
  const monthlyDeadRent = Math.round((firstYearInterest / 12) * 100) / 100;

  // Monthly Rent + Carrying Costs (Interest + Taxes + Insurance)
  const monthlyTax = (inputs.taxRate || 0) / 12;
  const monthlyIns = (inputs.insRate || 0) / 12;
  const monthlyRentPlusCarrying = Math.round((monthlyDeadRent + monthlyTax + monthlyIns) * 100) / 100;

  // Freedom Day of the Month (e.g. Day 18 out of 30)
  // Ratio of interest to total payment in year 1
  const firstRow = schedule[0];
  const interestRatio = firstRow && firstRow.payment > 0 ? firstRow.interest / firstRow.payment : 0.65;
  const freedomDayOfMonth = Math.min(30, Math.max(1, Math.round(30 * interestRatio)));

  const years = Object.keys(annualInterestMap).map(Number).sort((a, b) => a - b);
  const annualLaborHours = years.map((y) => Math.round((annualInterestMap[y]! / hourlyWage) * 10) / 10);

  return {
    totalHoursWorkedForBank,
    totalDaysWorkedForBank,
    monthlyDeadRent,
    monthlyRentPlusCarrying,
    freedomDayOfMonth,
    annualLaborHours
  };
};
