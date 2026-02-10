import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { db } from '../services/db';
import { useAppContext } from '../hooks/useAppContext';
import type { User, SecurityQuestion } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, EyeOff, X, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';

const LoginPage: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login, storeInfo } = useAppContext();
    const navigate = useNavigate();
    const hasUsers = useLiveQuery(() => db.users.count());
    const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (username.length < 4 || password.length < 4) {
            toast.error("Username and password must be at least 4 characters.");
            return;
        }
        setIsLoading(true);

        try {
            const user = await db.users.where('username').equalsIgnoreCase(username).first();
            
            let passwordMatches = false;
            if (user) {
                // Check against base64 encoded password (new/correct way)
                // And fallback to plain text for passwords created with the old bug
                passwordMatches = (user.passwordHash === btoa(password)) || (user.passwordHash === password);
            }

            if (user && passwordMatches) {
                toast.success(`Welcome back, ${user.username}!`);
                await login(user as User);
                navigate('/');
            } else {
                toast.error('Incorrect username or password.');
            }
        } catch (error) {
            console.error('Login failed', error);
            toast.error('An error occurred during login.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-secondary-100 dark:bg-secondary-950 p-4 animate-fadeIn">
            <div className="w-full max-w-md">
                <div className="bg-secondary-50 dark:bg-secondary-900 shadow-2xl rounded-2xl p-8 space-y-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400">{storeInfo?.storeName || 'UMJI POS'}</h1>
                        <p className="text-secondary-500 dark:text-secondary-400 mt-2">Sign in to your account</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="text-sm font-medium text-secondary-700 dark:text-secondary-300">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="mt-1 w-full px-4 py-3 bg-secondary-100 dark:bg-secondary-800 border border-secondary-300 dark:border-secondary-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                            />
                        </div>
                        <div className="relative">
                            <label className="text-sm font-medium text-secondary-700 dark:text-secondary-300">Password</label>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="mt-1 w-full px-4 py-3 bg-secondary-100 dark:bg-secondary-800 border border-secondary-300 dark:border-secondary-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-9 text-secondary-500">
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                        <div className="text-right">
                            <button type="button" onClick={() => setIsRecoveryOpen(true)} className="text-sm font-medium text-primary-600 hover:text-primary-500">
                                Forgot Password?
                            </button>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition disabled:bg-primary-300"
                        >
                            {isLoading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>
                    {hasUsers === 0 && (
                        <p className="text-center text-sm text-secondary-500 dark:text-secondary-400">
                            First time setup?{' '}
                            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-500">
                                Register New Store
                            </Link>
                        </p>
                    )}
                </div>
            </div>
            {isRecoveryOpen && <PasswordRecoveryModal onClose={() => setIsRecoveryOpen(false)} />}
        </div>
    );
};

const PasswordRecoveryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [username, setUsername] = useState('');
    const [userToRecover, setUserToRecover] = useState<User | null>(null);
    const [answers, setAnswers] = useState(['', '', '']);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    const [attempts, setAttempts] = useState(3);
    const [lockoutTime, setLockoutTime] = useState(0);

    useEffect(() => {
        const storedLockout = localStorage.getItem(`lockout_${username}`);
        if (storedLockout) {
            const lockoutEnd = parseInt(storedLockout, 10);
            if (Date.now() < lockoutEnd) {
                setLockoutTime(lockoutEnd);
            }
        }
    }, [username]);

    const handleFindUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const user = await db.users.where('username').equalsIgnoreCase(username).first();
            if (user && user.securityQuestions && user.securityQuestions.length === 3) {
                setUserToRecover(user);
                setStep(2);
            } else {
                toast.error("No account found or security questions are not set up.");
            }
        } catch (error) {
            toast.error("An error occurred.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleVerifyAnswers = async (e: React.FormEvent) => {
        e.preventDefault();
        if (lockoutTime > Date.now()) {
            toast.error(`Too many failed attempts. Please try again in ${Math.ceil((lockoutTime - Date.now()) / 60000)} minutes.`);
            return;
        }

        const correctAnswers = userToRecover?.securityQuestions?.map(sq => {
            try { return atob(sq.answer); } catch { return `__invalid_answer_${Math.random()}`; }
        }) || [];
        
        const isMatch = answers.every((ans, i) => ans.trim().toLowerCase() === correctAnswers[i]);
        
        if (isMatch) {
            toast.success("Answers verified!");
            setStep(3);
        } else {
            const newAttempts = attempts - 1;
            setAttempts(newAttempts);
            if (newAttempts <= 0) {
                const lockoutEnd = Date.now() + 10 * 60 * 1000; // 10 minutes
                localStorage.setItem(`lockout_${username}`, lockoutEnd.toString());
                setLockoutTime(lockoutEnd);
                toast.error("Too many failed attempts. Please try again in 10 minutes.");
            } else {
                toast.error(`Incorrect answers. You have ${newAttempts} attempts left.`);
            }
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 4) {
            toast.error("Password must be at least 4 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
        
        setIsLoading(true);
        try {
            if (userToRecover?.id) {
                await db.users.update(userToRecover.id, { passwordHash: btoa(newPassword) });
                toast.success("Password reset successfully! Please log in.");
                localStorage.removeItem(`lockout_${username}`);
                onClose();
            }
        } catch (error) {
            toast.error("Failed to reset password.");
        } finally {
            setIsLoading(false);
        }
    };

    const renderContent = () => {
        if (lockoutTime > Date.now()) {
            return (
                <div className="text-center">
                    <p className="text-lg font-semibold text-red-500">Account Locked</p>
                    <p className="text-secondary-500">Due to too many failed attempts, this account is temporarily locked. Please try again in approximately {Math.ceil((lockoutTime - Date.now()) / 60000)} minute(s).</p>
                </div>
            )
        }
        switch (step) {
            case 1:
                return (
                    <form onSubmit={handleFindUser} className="space-y-6">
                        <h3 className="text-xl font-bold text-center">Find Your Account</h3>
                        <p className="text-center text-secondary-500 text-sm">Enter your username to begin the recovery process.</p>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required autoFocus className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <button type="submit" disabled={isLoading} className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:bg-primary-300">
                            {isLoading ? 'Searching...' : 'Next'} <ArrowRight className="inline" size={16}/>
                        </button>
                    </form>
                );
            case 2:
                return (
                    <form onSubmit={handleVerifyAnswers} className="space-y-4">
                        <h3 className="text-xl font-bold text-center">Answer Security Questions</h3>
                        {userToRecover?.securityQuestions?.map((sq, i) => (
                            <div key={i}>
                                <label className="text-sm font-medium text-secondary-700 dark:text-secondary-300">{sq.question}</label>
                                <input type="text" value={answers[i]} onChange={e => {const newAns = [...answers]; newAns[i] = e.target.value; setAnswers(newAns);}} required className="mt-1 w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                            </div>
                        ))}
                         <button type="submit" className="w-full py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700">
                            Verify Answers <ShieldCheck className="inline" size={16}/>
                        </button>
                    </form>
                );
            case 3:
                return (
                     <form onSubmit={handleResetPassword} className="space-y-4">
                        <h3 className="text-xl font-bold text-center">Reset Your Password</h3>
                        <div className="relative">
                            <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-secondary-500">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                        </div>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <button type="submit" disabled={isLoading} className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-green-300">
                            {isLoading ? 'Resetting...' : 'Reset Password'} <KeyRound className="inline" size={16}/>
                        </button>
                    </form>
                );
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-8 w-full max-w-md relative animate-slideInUp">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-secondary-200 dark:hover:bg-secondary-800 rounded-full"><X size={20}/></button>
                {renderContent()}
            </div>
        </div>
    );
};

export default LoginPage;