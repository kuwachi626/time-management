import React, { useState, useEffect, useMemo, ChangeEvent } from "react";

// --- 型定義 (Interfaces) ---
interface ScheduleItem {
	category: string;
	start: string;
	end: string;
	startSec: number;
	endSec: number;
}

// --- ヘルパー関数 ---
const timeToSeconds = (timeStr: string): number => {
	const [h, m] = timeStr.trim().split(":").map(Number);
	return h * 3600 + m * 60;
};

const formatDuration = (totalSeconds: number): string => {
	if (totalSeconds <= 0) return "00:00:00";
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

const App: React.FC = () => {
	// --- 状態管理 ---
	const [now, setNow] = useState<Date>(new Date());
	const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

	// --- 1秒ごとのタイマー ---
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	// --- CSV読み込み処理 ---
	const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			const lines = text.split(/\r?\n/).slice(1);

			const data: ScheduleItem[] = lines
				.map((line) => {
					const [category, start, end] = line.split(",");
					if (!category || !start || !end) return null;
					return {
						category: category.trim(),
						start: start.trim(),
						end: end.trim(),
						startSec: timeToSeconds(start),
						endSec: timeToSeconds(end),
					};
				})
				.filter((item): item is ScheduleItem => item !== null)
				.sort((a, b) => a.startSec - b.startSec);

			setSchedule(data);
		};
		reader.readAsText(file);
	};

	// --- スケジュール判定 ---
	const nowSec =
		now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

	const { current, next } = useMemo(() => {
		const currentTask = schedule.find(
			(item) => nowSec >= item.startSec && nowSec < item.endSec,
		);
		const nextTask = schedule.find((item) => item.startSec > nowSec);
		return { current: currentTask, next: nextTask };
	}, [nowSec, schedule]);

	const remainingTime = current ? current.endSec - nowSec : 0;

	return (
		<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans antialiased text-slate-900">
			<div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-blue-100 overflow-hidden border border-white">
				{/* CSVアップローダーセクション */}
				<div className="p-6 bg-slate-900 text-white">
					<label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
						Import Schedule (CSV)
					</label>
					<input
						type="file"
						accept=".csv"
						onChange={handleFileUpload}
						className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer transition-all"
					/>
				</div>

				<div className="p-10 space-y-10">
					{/* デジタル時計 */}
					<div className="text-center">
						<div className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full mb-3">
							Live Tracker
						</div>
						<h1 className="text-6xl font-black tracking-tighter tabular-nums">
							{now.toLocaleTimeString("ja-JP", { hour12: false })}
						</h1>
					</div>

					{/* メインステータス */}
					<div className="space-y-8">
						<section className="relative">
							<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
								Current Status
							</p>
							<div className="flex items-baseline justify-between gap-4">
								<h2 className="text-4xl font-black text-blue-600 leading-tight truncate">
									{current?.category || "Free Time"}
								</h2>
								<span className="text-xl font-bold text-slate-300 whitespace-nowrap">
									{current ? `until ${current.end}` : "--:--"}
								</span>
							</div>
						</section>

						{/* カウントダウン */}
						<div className="bg-slate-900 rounded-3xl p-8 text-center shadow-xl shadow-slate-200">
							<p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">
								Remaining
							</p>
							<p className="text-5xl font-mono font-bold text-white tabular-nums">
								{formatDuration(remainingTime)}
							</p>
						</div>

						{/* 次の予定 */}
						<section className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
							<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
								Up Next
							</p>
							<div className="flex justify-between items-center">
								<div>
									<h3 className="text-xl font-extrabold text-slate-700">
										{next?.category || "No more tasks"}
									</h3>
									<p className="text-sm font-bold text-slate-400">
										{next
											? `${next.start} - ${next.end}`
											: "Enjoy your rest!"}
									</p>
								</div>
								{next && (
									<div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
								)}
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
};

export default App;
