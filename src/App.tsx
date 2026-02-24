import React, { useState, useEffect, useMemo, ChangeEvent } from "react";

// --- 型定義 ---
interface ScheduleItem {
	times: string; // 回数 (例: 1(5))
	className: string; // クラス (例: RMC)
	start: string; // 開始 (例: 9:00)
	end: string; // 終了 (例: 9:15)
	duration: string; // 走行時間 (例: 0:15)
	startSec: number;
	endSec: number;
}

// --- ヘルパー関数 ---
const timeToSeconds = (timeStr: string): number => {
	if (!timeStr) return 0;
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
	const [now, setNow] = useState<Date>(new Date());

	// LocalStorageから初期データを取得
	const [schedule, setSchedule] = useState<ScheduleItem[]>(() => {
		const saved = localStorage.getItem("raceSchedule");
		return saved ? JSON.parse(saved) : [];
	});

	// タイマー更新
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	// データ保存
	useEffect(() => {
		localStorage.setItem("raceSchedule", JSON.stringify(schedule));
	}, [schedule]);

	// CSV読み込み (新フォーマット対応)
	const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			const lines = text.split(/\r?\n/).slice(1); // ヘッダーを飛ばす

			const data: ScheduleItem[] = lines
				.map((line) => {
					// 回数,クラス,開始,終了,走行時間 の5カラム
					const [times, className, start, end, duration] =
						line.split(",");
					if (!times || !className || !start || !end) return null;

					return {
						times: times.trim(),
						className: className.trim(),
						start: start.trim(),
						end: end.trim(),
						duration: duration?.trim() || "",
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

	// スケジュール判定
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
		<div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans antialiased text-slate-900">
			<div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-white">
				{/* CSVアップローダー */}
				<div className="p-6 bg-blue-900 text-white flex justify-between items-end">
					<div className="flex-1">
						<label className="block text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">
							Import Track Schedule
						</label>
						<input
							type="file"
							accept=".csv"
							onChange={handleFileUpload}
							className="block w-full text-xs text-blue-200 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
						/>
					</div>
					<button
						onClick={() => setSchedule([])}
						className="ml-4 text-[10px] font-black text-red-400 uppercase mb-1"
					>
						Clear
					</button>
				</div>

				<div className="p-8 space-y-8">
					{/* 現在時刻 */}
					<div className="text-center">
						<div className="text-4xl font-black tracking-tighter tabular-nums text-slate-800">
							{now.toLocaleTimeString("ja-JP", { hour12: false })}
						</div>
						<p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
							Current Time
						</p>
					</div>

					{/* メインセッション表示 */}
					<div className="space-y-6">
						<section className="bg-blue-50 rounded-3xl p-6 border border-blue-100">
							<p className="text-[10px] font-black text-blue-400 uppercase mb-2">
								Now Racing
							</p>
							<div className="flex flex-col">
								<div className="flex items-center gap-2 mb-1">
									<span className="text-sm font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">
										{current?.times || "---"}
									</span>
									<h2 className="text-2xl font-black text-blue-900 truncate">
										{current?.className || "No Session"}
									</h2>
								</div>
								<div className="flex justify-between items-baseline">
									<span className="text-sm font-bold text-blue-700">
										{current
											? `${current.start} - ${current.end}`
											: "--:--"}
									</span>
									{current && (
										<span className="text-xs font-bold text-blue-400">
											Duration: {current.duration}
										</span>
									)}
								</div>
							</div>
						</section>

						{/* カウントダウン */}
						<div className="bg-slate-900 rounded-3xl p-6 text-center">
							<p className="text-[10px] font-black text-slate-500 uppercase mb-1">
								Session Ends In
							</p>
							<p className="text-5xl font-mono font-bold text-white tabular-nums tracking-tight">
								{formatDuration(remainingTime)}
							</p>
						</div>

						{/* 次の予定 */}
						<section className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
							<p className="text-[10px] font-black text-slate-400 uppercase mb-2 text-center">
								Up Next
							</p>
							{next ? (
								<div className="flex justify-between items-center">
									<div>
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
												{next.times}
											</span>
											<h3 className="text-lg font-black text-slate-700">
												{next.className}
											</h3>
										</div>
										<p className="text-xs font-bold text-slate-400 ml-10">
											{next.start} - {next.end}
										</p>
									</div>
									<div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
								</div>
							) : (
								<p className="text-center text-sm font-bold text-slate-400 uppercase">
									Checkered Flag
								</p>
							)}
						</section>
					</div>
				</div>
			</div>
		</div>
	);
};

export default App;
