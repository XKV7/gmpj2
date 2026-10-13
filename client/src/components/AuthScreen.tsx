import { useState } from 'react';
import { LIMITS } from '@moyeo/shared';
import { errorMessage } from '../lib/api';
import { login, register } from '../store/actions';
import { Icon } from './Icon';

export function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username.trim())) {
        setError('아이디는 영문, 숫자, _ . 로 3~20자여야 해요.');
        return;
      }
      if (password !== password2) {
        setError('비밀번호가 서로 달라요.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), nickname.trim() || username.trim(), password);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-art" aria-hidden>
        <div className="auth-brand">
          <span className="auth-logo">
            <svg viewBox="0 0 64 64" width="44" height="44"><circle cx="24" cy="30" r="9" fill="#fff" /><circle cx="40" cy="30" r="9" fill="#fff" opacity=".85" /><path d="M18 46c4 4 24 4 28 0" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" /></svg>
          </span>
          <span>모여</span>
        </div>
        <h1>좋아하는 사람들과<br />언제든 모여요</h1>
        <p>1:1 대화, 그룹 채팅, 커뮤니티 서버, 음성·영상 통화까지.<br />같은 와이파이라면 지금 바로 함께할 수 있어요.</p>
        <div className="auth-bubbles">
          <div className="bubble b1"><span>🍕</span> 오늘 저녁 뭐 먹어?</div>
          <div className="bubble b2">치킨 어때?! 🍗 <span className="read">1</span></div>
          <div className="bubble b3"><span>🎧</span> 라운지 음성방 들어와~</div>
        </div>
      </div>
      <div className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-mobile-brand">
            <span className="auth-logo small"><svg viewBox="0 0 64 64" width="28" height="28"><circle cx="24" cy="30" r="9" fill="#fff" /><circle cx="40" cy="30" r="9" fill="#fff" opacity=".85" /><path d="M18 46c4 4 24 4 28 0" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" /></svg></span>
            모여
          </div>
          <h2>{mode === 'login' ? '다시 만나서 반가워요!' : '모여에 오신 걸 환영해요'}</h2>
          <p className="muted">{mode === 'login' ? '아이디와 비밀번호로 로그인하세요.' : '몇 초면 가입이 끝나요.'}</p>
          <label className="field">
            <span>아이디</span>
            <input className="input" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="영문, 숫자, _ ." maxLength={LIMITS.USERNAME_MAX} required autoFocus />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span>닉네임</span>
              <input className="input" name="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="친구들에게 보일 이름" maxLength={LIMITS.NICKNAME_MAX} required />
            </label>
          )}
          <label className="field">
            <span>비밀번호</span>
            <div className="input-with-icon right">
              <input name="password" type={showPw ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'register' ? `${LIMITS.PASSWORD_MIN}자 이상` : ''} required />
              <button type="button" className="icon-btn tiny" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}>
                <Icon name={showPw ? 'lock' : 'search'} size={14} />
              </button>
            </div>
          </label>
          {mode === 'register' && (
            <label className="field">
              <span>비밀번호 확인</span>
              <input className="input" name="password2" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
            </label>
          )}
          {error && <p className="form-error" role="alert"><Icon name="alert" size={14} /> {error}</p>}
          <button className="btn btn-primary btn-lg full" disabled={busy}>{busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}</button>
          <p className="auth-switch">
            {mode === 'login' ? '처음이신가요?' : '이미 계정이 있나요?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
              {mode === 'login' ? '회원가입' : '로그인'}
            </button>
          </p>
          {mode === 'login' && <p className="auth-demo">체험용 계정: <code>minji</code> · <code>junho</code> · <code>seoyeon</code> / 비밀번호 <code>moyeo1234</code><br /><small>(npm run seed 실행 시)</small></p>}
        </form>
      </div>
    </div>
  );
}
