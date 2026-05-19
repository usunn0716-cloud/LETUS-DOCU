"use client";

import { Check } from "lucide-react";

interface StepIndicatorProps {
    currentStep: number;
    steps: { label: string; icon?: string }[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
    return (
        <div className="flex items-center justify-between w-full max-w-xl mx-auto px-2">
            {steps.map((step, idx) => {
                const stepNum = idx + 1;
                const isCompleted = stepNum < currentStep;
                const isActive = stepNum === currentStep;

                return (
                    <div key={idx} className="flex items-center flex-1 last:flex-none">
                        {/* Step circle */}
                        <div className="flex flex-col items-center">
                            <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                                    isCompleted
                                        ? "bg-green-500 text-white shadow-md shadow-green-200"
                                        : isActive
                                            ? "bg-letus-orange text-white shadow-lg shadow-orange-200 scale-110"
                                            : "bg-slate-200 text-slate-400"
                                }`}
                            >
                                {isCompleted ? (
                                    <Check className="w-4 h-4" />
                                ) : (
                                    step.icon || stepNum
                                )}
                            </div>
                            <span
                                className={`text-[10px] mt-1.5 whitespace-nowrap font-medium transition-colors ${
                                    isActive
                                        ? "text-letus-orange"
                                        : isCompleted
                                            ? "text-green-600"
                                            : "text-slate-400"
                                }`}
                            >
                                {step.label}
                            </span>
                        </div>

                        {/* Connector line */}
                        {idx < steps.length - 1 && (
                            <div
                                className={`flex-1 h-0.5 mx-1.5 rounded-full transition-all duration-500 ${
                                    isCompleted ? "bg-green-400" : "bg-slate-200"
                                }`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
