"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  MAX_PARTICIPANTS,
  generateRound,
  pairKey,
  validateParticipants,
  type Participant,
} from "@/lib/icebreaker/matching";
import {
  EMPTY_ACTIVITY,
  restoreActivity,
  type ActivityRound,
  type ActivityState,
} from "@/lib/icebreaker/storage";

import styles from "./icebreaker.module.css";

const STORAGE_KEY = "hackkit.icebreaker.activity.v1";

function splitTags(value: string) {
  return value.split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean);
}

function makeParticipantId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function IcebreakerWorkspace() {
  const [activity, setActivity] = useState<ActivityState>(EMPTY_ACTIVITY);
  const [nickname, setNickname] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [excludeFirst, setExcludeFirst] = useState("");
  const [excludeSecond, setExcludeSecond] = useState("");
  const [notice, setNotice] = useState("数据仅保存在这台设备的浏览器中。");
  const [error, setError] = useState("");
  const hydrated = useRef(false);
  const participantMap = useMemo(
    () => new Map(activity.participants.map((participant) => [participant.id, participant])),
    [activity.participants],
  );
  const validation = validateParticipants(activity.participants);
  const latestRound = activity.rounds.at(-1) ?? null;

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    queueMicrotask(() => {
      if (saved) {
        const restored = restoreActivity(saved);
        if (restored) {
          setActivity(restored);
          setNotice("已恢复这台设备上次保存的活动。");
        } else {
          setNotice("本地活动数据无法读取，已使用空白活动；原数据未被上传。");
        }
      }
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(activity));
    } catch {
      queueMicrotask(() => setNotice("浏览器未能保存本次修改；请立即导出 JSON 备份。"));
    }
  }, [activity]);

  function addParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const cleanNickname = nickname.trim();
    if (!cleanNickname) {
      setError("请填写公开昵称。昵称不会与真实平台账号关联。");
      return;
    }
    if (activity.participants.length >= MAX_PARTICIPANTS) {
      setError(`已达到 ${MAX_PARTICIPANTS} 人上限。该上限用于保证本地精确匹配速度。`);
      return;
    }
    if (activity.participants.some((person) => person.nickname.trim().toLocaleLowerCase("zh-CN") === cleanNickname.toLocaleLowerCase("zh-CN"))) {
      setError(`昵称“${cleanNickname}”已存在，请用可区分的公开昵称。`);
      return;
    }
    const participant: Participant = {
      id: makeParticipantId(),
      nickname: cleanNickname,
      skills: splitTags(skills),
      interests: splitTags(interests),
    };
    setActivity((current) => ({ ...current, participants: [...current.participants, participant] }));
    setNickname("");
    setSkills("");
    setInterests("");
    setNotice(participant.skills.length || participant.interests.length
      ? `已登记 ${participant.nickname}。`
      : `已登记 ${participant.nickname}；未填写标签，匹配时只能减少重复，无法计算兴趣或技能依据。`);
  }

  function removeParticipant(id: string) {
    if (activity.rounds.some((round) => round.pairs.some((pair) => pair.participantIds.includes(id))
      || round.unmatchedParticipantIds.includes(id))) {
      setError("该成员已进入历史轮次。请先撤销相关轮次，或清空活动后重新登记。");
      return;
    }
    setActivity((current) => ({
      ...current,
      participants: current.participants.filter((participant) => participant.id !== id),
      excludedPairKeys: current.excludedPairKeys.filter((key) => !key.split("::").includes(id)),
    }));
    setError("");
  }

  function addExclusion() {
    setError("");
    if (!excludeFirst || !excludeSecond || excludeFirst === excludeSecond) {
      setError("请选择两名不同的参与者作为排除配对。");
      return;
    }
    const key = pairKey(excludeFirst, excludeSecond);
    if (activity.excludedPairKeys.includes(key)) {
      setError("这组排除配对已经存在。");
      return;
    }
    setActivity((current) => ({ ...current, excludedPairKeys: [...current.excludedPairKeys, key] }));
    setExcludeFirst("");
    setExcludeSecond("");
    setNotice("排除配对已保存，将从下一轮起生效。");
  }

  function startRound() {
    setError("");
    if (activity.participants.length < 2) {
      setError("至少登记 2 名参与者才能开始一轮。");
      return;
    }
    if (validation.emptyNicknameIds.length || validation.duplicateNicknames.length) {
      setError("成员名单包含空昵称或重名，请修正后再开始。");
      return;
    }
    try {
      const generated = generateRound({
        participants: activity.participants,
        excludedPairKeys: activity.excludedPairKeys,
        history: activity.rounds,
      });
      const round: ActivityRound = { ...generated, generatedAt: new Date().toISOString() };
      setActivity((current) => ({ ...current, rounds: [...current.rounds, round] }));
      setNotice(`第 ${round.number} 轮已生成并保存在本机。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法生成本轮，请检查输入。");
    }
  }

  function undoRound() {
    if (!latestRound) return;
    setActivity((current) => ({ ...current, rounds: current.rounds.slice(0, -1) }));
    setNotice(`已撤销第 ${latestRound.number} 轮。成员和排除设置保持不变。`);
    setError("");
  }

  function clearActivity() {
    const confirmed = window.confirm("确认清空整个本地活动？成员、排除设置和全部历史轮次都会被删除，且无法撤销。");
    if (!confirmed) return;
    setActivity(EMPTY_ACTIVITY);
    setExcludeFirst("");
    setExcludeSecond("");
    window.localStorage.removeItem(STORAGE_KEY);
    setNotice("本地活动已清空。");
    setError("");
  }

  function exportJson() {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      activityName: activity.activityName.trim() || "未命名活动",
      participants: activity.participants,
      exclusions: activity.excludedPairKeys.map((key) => {
        const [firstId, secondId] = key.split("::");
        return {
          participantIds: [firstId, secondId],
          nicknames: [participantMap.get(firstId)?.nickname ?? firstId, participantMap.get(secondId)?.nickname ?? secondId],
        };
      }),
      rounds: activity.rounds,
      privacy: "本文件只包含主持人在本设备上输入的公开昵称、技能和兴趣标签。",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(activity.activityName.trim() || "hackkit-icebreaker").replace(/[\\/:*?"<>|]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("真实活动数据已导出为 JSON。");
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <p>LOCAL ONLY · NO LOGIN · {activity.participants.length}/{MAX_PARTICIPANTS}</p>
      </header>

      <section className={styles.hero}>
        <div>
          <h1>下一轮，<br />和谁聊？</h1>
          <p>在一台设备上登记昵称、技能和兴趣。系统会尽量避开上一轮搭档，并说明这次为什么这样配。</p>
        </div>
        <label className={styles.eventField}>
          <span>活动名称</span>
          <input
            value={activity.activityName}
            onChange={(event) => setActivity((current) => ({ ...current, activityName: event.target.value }))}
            placeholder="例如：HackKit Demo Night"
            maxLength={80}
          />
        </label>
      </section>

      <div className={styles.privacyStrip}>
        不收集联系方式、性别或年龄；这里只匹配本设备登记的现场成员，不代表任何平台用户关系。
      </div>

      <div className={styles.workspace}>
        <aside className={styles.setupColumn}>
          <section className={styles.section} aria-labelledby="participant-heading">
            <div className={styles.sectionHeading}>
              <h2 id="participant-heading">登记参与者</h2>
              <span>{activity.participants.length} 人</span>
            </div>
            <form className={styles.participantForm} onSubmit={addParticipant}>
              <label>
                <span>公开昵称 <b>必填</b></span>
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} placeholder="例如：阿青" />
              </label>
              <label>
                <span>技能标签</span>
                <input value={skills} onChange={(event) => setSkills(event.target.value)} maxLength={160} placeholder="React，视觉设计" />
              </label>
              <label>
                <span>兴趣标签</span>
                <input value={interests} onChange={(event) => setInterests(event.target.value)} maxLength={160} placeholder="AI Agent，教育" />
              </label>
              <p>标签用逗号分隔；可留空，但依据会更少。</p>
              <button className={styles.secondaryButton} type="submit">加入现场名单</button>
            </form>

            <div className={styles.roster} aria-label="参与者名单">
              {activity.participants.length === 0 ? (
                <p className={styles.empty}>还没有成员。先登记至少两人。</p>
              ) : activity.participants.map((participant) => (
                <article className={styles.personRow} key={participant.id}>
                  <div>
                    <strong>{participant.nickname}</strong>
                    <p>{[...participant.skills, ...participant.interests].join(" · ") || "未填写标签"}</p>
                  </div>
                  <button type="button" onClick={() => removeParticipant(participant.id)} aria-label={`移除 ${participant.nickname}`}>移除</button>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="exclude-heading">
            <div className={styles.sectionHeading}>
              <h2 id="exclude-heading">排除配对</h2>
              <span>可选</span>
            </div>
            <p className={styles.sectionNote}>适合同队或明确不应配对的成员。排除过多可能造成多人无法匹配。</p>
            <div className={styles.exclusionForm}>
              <select value={excludeFirst} onChange={(event) => setExcludeFirst(event.target.value)} aria-label="第一名参与者">
                <option value="">选择成员 A</option>
                {activity.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.nickname}</option>)}
              </select>
              <select value={excludeSecond} onChange={(event) => setExcludeSecond(event.target.value)} aria-label="第二名参与者">
                <option value="">选择成员 B</option>
                {activity.participants.map((participant) => <option value={participant.id} key={participant.id}>{participant.nickname}</option>)}
              </select>
              <button type="button" className={styles.textButton} onClick={addExclusion}>添加排除</button>
            </div>
            <div className={styles.exclusionList}>
              {activity.excludedPairKeys.map((key) => {
                const [firstId, secondId] = key.split("::");
                return (
                  <span key={key}>
                    {participantMap.get(firstId)?.nickname ?? "已移除"} / {participantMap.get(secondId)?.nickname ?? "已移除"}
                    <button type="button" onClick={() => setActivity((current) => ({ ...current, excludedPairKeys: current.excludedPairKeys.filter((item) => item !== key) }))}>删除</button>
                  </span>
                );
              })}
            </div>
          </section>
        </aside>

        <section className={styles.resultColumn} aria-labelledby="round-heading">
          <div className={styles.roundControl}>
            <div>
              <span>第 {activity.rounds.length + 1} 轮待命</span>
              <h2 id="round-heading">本轮匹配台</h2>
              <p>目标顺序：完整配对 → 轮空公平 → 减少重复 → 标签契合。</p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={startRound} disabled={activity.participants.length < 2}>生成下一轮</button>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          <p className={styles.notice} role="status" aria-live="polite">{notice}</p>

          {!latestRound ? (
            <div className={styles.roundEmpty}>
              <strong>配对结果会出现在这里</strong>
              <p>至少登记两人。空标签可以参与，但不会产生虚构的兴趣或技能依据。</p>
            </div>
          ) : (
            <RoundView round={latestRound} participantMap={participantMap} />
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={undoRound} disabled={!latestRound}>撤销最近一轮</button>
            <button type="button" className={styles.secondaryButton} onClick={exportJson} disabled={!activity.participants.length}>导出 JSON</button>
            <button type="button" className={styles.dangerButton} onClick={clearActivity} disabled={!activity.participants.length && !activity.rounds.length && !activity.activityName}>清空本地活动</button>
          </div>

          <section className={styles.history} aria-labelledby="history-heading">
            <div className={styles.sectionHeading}>
              <h2 id="history-heading">历史轮次</h2>
              <span>{activity.rounds.length} 轮</span>
            </div>
            {activity.rounds.length === 0 ? <p className={styles.empty}>尚未生成轮次。</p> : (
              <ol>
                {[...activity.rounds].reverse().map((round) => (
                  <li key={`${round.number}-${round.generatedAt}`}>
                    <strong>第 {round.number} 轮</strong>
                    <span>{round.pairs.map((pair) => pair.participantIds.map((id) => participantMap.get(id)?.nickname ?? id).join(" + ")).join("；")}</span>
                    {round.unmatchedParticipantIds.length > 0 && <em>未匹配：{round.unmatchedParticipantIds.map((id) => participantMap.get(id)?.nickname ?? id).join("、")}</em>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function RoundView({ round, participantMap }: { round: ActivityRound; participantMap: Map<string, Participant> }) {
  return (
    <div className={styles.roundResult}>
      <div className={styles.roundMeta}>
        <strong>第 {round.number} 轮 · {round.pairs.length} 组</strong>
        <time dateTime={round.generatedAt}>{new Date(round.generatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
      </div>
      {round.reuseReason && (
        <p className={styles.reuseNotice}>
          {round.reuseReason === "all_pairs_used"
            ? "所有允许的两人组合都已用过，本轮开始复用旧配对。"
            : "无重复配对已不足以完成同等数量的组合，本轮开始复用部分旧配对。"}
        </p>
      )}
      <div className={styles.pairList}>
        {round.pairs.map((pair) => {
          const first = participantMap.get(pair.participantIds[0]);
          const second = participantMap.get(pair.participantIds[1]);
          return (
            <article className={styles.pairRow} key={pairKey(...pair.participantIds)}>
              <div className={styles.names}>
                <strong>{first?.nickname ?? pair.participantIds[0]}</strong>
                <span>与</span>
                <strong>{second?.nickname ?? pair.participantIds[1]}</strong>
              </div>
              <div className={styles.scoreLine}>
                <span>标签分 {pair.score.affinity}</span>
                <span>{pair.score.previousMeetings ? `历史相遇 ${pair.score.previousMeetings} 次` : "首次配对"}</span>
              </div>
              <ul>{pair.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
              <p className={styles.prompt}><b>交流提示</b>{pair.conversationPrompt}</p>
            </article>
          );
        })}
      </div>
      {round.unmatchedParticipantIds.length > 0 && (
        <div className={styles.unmatched}>
          <strong>{round.byeParticipantId ? "本轮轮空" : "本轮无法完全匹配"}</strong>
          <p>{round.unmatchedParticipantIds.map((id) => participantMap.get(id)?.nickname ?? id).join("、")}</p>
          <span>{round.byeParticipantId
            ? "奇数人数需要一人轮空；后续轮次会优先让本轮轮空者参与。"
            : "当前排除关系限制了完整配对。调整排除项后再生成下一轮。"}</span>
        </div>
      )}
    </div>
  );
}
