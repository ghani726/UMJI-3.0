import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { db, seedInitialData, seedCoreData } from '../services/db';
import type { StoreInfo, User, SecurityQuestion } from '../types';
import { DEFAULT_PAYMENT_METHODS } from '../types';
import { CheckCircle, Circle, ArrowRight, User as UserIcon, Building, ShieldCheck, Database, Sliders, Eye, EyeOff } from 'lucide-react';

const SECURITY_QUESTIONS = [
  'What is your mother’s maiden name?',
  'What was the name of your first pet?',
  'What is your favorite color?',
  'What is your birthplace?',
  'What is your best friend’s name?',
];

const RegisterPage: React.FC = () => {
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    // Step 1 State
    const [businessData, setBusinessData] = useState({
        storeName: '', ownerName: '', email: '', phone: '', address: ''
    });
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Step 2 State
    const [accountData, setAccountData] = useState({
        username: '', password: '', confirmPassword: '',
        securityQuestions: [
            { question: '', answer: '' },
            { question: '', answer: '' },
            { question: '', answer: '' }
        ] as SecurityQuestion[]
    });

    // Step 3 State
    const [setupOptions, setSetupOptions] = useState({
        startWithDemo: true,
        enableDarkMode: false,
        autoBackup: false,
        enableQuickSale: false,
        currency: 'Rs'
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    const validateStep1 = () => {
        const step1Fields = ['storeName', 'ownerName', 'email', 'phone', 'address'];
        const newErrors: Record<string, string> = {};
        if (businessData.storeName.trim().length < 4) newErrors.storeName = 'Business name must be at least 4 characters.';
        if (businessData.ownerName.trim().length < 2) newErrors.ownerName = 'Owner name must be at least 2 characters.';
        if (businessData.email.trim() && !/^\S+@\S+\.\S+$/.test(businessData.email)) newErrors.email = 'Please enter a valid email address.';
        if (!/^\d{10,15}$/.test(businessData.phone.replace(/\s/g, ''))) newErrors.phone = 'Phone number must be 10-15 digits.';
        if (businessData.address.length > 150) newErrors.address = 'Address must be less than 150 characters.';

        setErrors(prev => {
            const nextErrors = { ...prev };
            step1Fields.forEach(field => delete nextErrors[field]);
            return { ...nextErrors, ...newErrors };
        });
        
        return Object.keys(newErrors).length === 0;
    };
    
    const validateStep2 = () => {
        const step2Fields = ['username', 'password', 'confirmPassword', 'securityQuestions', 'securityAnswers'];
        const newErrors: Record<string, string> = {};
        if (accountData.username.trim().length < 4) {
            newErrors.username = 'Username must be at least 4 characters.';
        } else if (/\s/.test(accountData.username)) {
            newErrors.username = 'Username cannot contain spaces.';
        }
        if (accountData.password.length < 4) newErrors.password = 'Password must be at least 4 characters.';
        if (accountData.confirmPassword && accountData.password !== accountData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match.';
        
        const questions = accountData.securityQuestions.map(q => q.question.trim()).filter(Boolean);
        if (questions.length < 3) {
            newErrors.securityQuestions = 'All three security questions are required.';
        } else if (new Set(questions).size !== questions.length) {
            newErrors.securityQuestions = 'Each security question must be unique.';
        }
        if (accountData.securityQuestions.some(q => !q.answer.trim())) newErrors.securityAnswers = 'All security answers are required.';

        setErrors(prev => {
            const nextErrors = { ...prev };
            step2Fields.forEach(field => delete nextErrors[field]);
            return { ...nextErrors, ...newErrors };
        });

        return Object.keys(newErrors).length === 0;
    };
    
    useEffect(() => {
        const shouldValidate = Object.values(touched).some(Boolean);
        if(shouldValidate) {
            if (step === 1) validateStep1();
            if (step === 2) validateStep2();
        }
    }, [businessData, accountData, step, touched]);


    const handleNext = () => {
        if (step === 1) {
            setTouched({ storeName: true, ownerName: true, phone: true, email: true, address: true });
            if (validateStep1()) {
                setStep(2);
            }
        } else if (step === 2) {
             setTouched(prev => ({...prev, username: true, password: true, confirmPassword: true, securityQuestions: true, securityAnswers: true }));
            if (validateStep2()) {
                setStep(3);
            }
        }
    };
    
    const handleBack = () => {
        setStep(prev => prev - 1);
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (!['image/jpeg', 'image/png'].includes(file.type)) {
                toast.error("Logo must be a JPG or PNG file.");
                return;
            }
            if (file.size > 2 * 1024 * 1024) { // 2MB
                toast.error("Logo file size cannot exceed 2MB.");
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => setLogoPreview(event.target?.result as string);
            reader.readAsDataURL(file);
        }
    };
    
    const handleRegistration = async () => {
        setIsLoading(true);
        try {
            await (db as any).transaction('rw', ...(db as any).tables, async () => {
                const storeInfo: Omit<StoreInfo, 'id'> = {
                    storeName: businessData.storeName,
                    ownerName: businessData.ownerName,
                    address: businessData.address,
                    phone: businessData.phone,
                    email: businessData.email,
                    logo: logoPreview || undefined,
                    currency: setupOptions.currency,
                    theme: setupOptions.enableDarkMode ? 'dark' : 'light',
                    accentColor: '#5d2bff',
                    invoiceCounter: 1,
                    receiptPageSize: 'thermal_80mm',
                    receiptHeaderColor: '#5d2bff',
                    reportPaperSize: 'A4',
                    reportMargins: { top: 20, right: 15, bottom: 20, left: 15 },
                    reportShowDate: true,
                    reportLayoutOrder: ['logo', 'storeName', 'address', 'reportTitle', 'dateRange', 'summaryCards', 'chart', 'dataTable'],
                    isDemoMode: setupOptions.startWithDemo,
                    autoBackup: setupOptions.autoBackup,
                    enableQuickSale: setupOptions.enableQuickSale,
                    paymentMethods: DEFAULT_PAYMENT_METHODS,
                };
                await db.storeInfo.add(storeInfo as StoreInfo);
                
                if (setupOptions.startWithDemo) {
                    await seedInitialData();
                } else {
                    await seedCoreData();
                }
                
                const adminRole = await db.roles.where('name').equalsIgnoreCase('Admin').first();
                if (!adminRole) throw new Error("Admin role not found during setup.");

                const newUser: Omit<User, 'id'> = {
                    username: accountData.username,
                    passwordHash: btoa(accountData.password), // Basic encoding
                    roleId: adminRole.id!,
                    securityQuestions: accountData.securityQuestions.map(sq => ({
                        question: sq.question,
                        answer: btoa(sq.answer.trim().toLowerCase()) // Encode answers
                    })),
                };
                await db.users.add(newUser as User);
            });
            toast.success("Registration successful! Please log in to continue.");
            navigate('/login');
        } catch (error) {
            console.error("Registration failed", error);
            toast.error(`An error occurred: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const renderStep = () => {
        switch(step) {
            case 1: return <Step1 data={businessData} setData={setBusinessData} errors={errors} onLogoUpload={handleLogoUpload} logoPreview={logoPreview} touched={touched} setTouched={setTouched} />;
            case 2: return <Step2 data={accountData} setData={setAccountData} errors={errors} touched={touched} setTouched={setTouched} />;
            case 3: return <Step3 data={setupOptions} setData={setSetupOptions} />;
            default: return null;
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-secondary-100 dark:bg-secondary-950 p-4 animate-fadeIn">
            <div className="w-full max-w-2xl">
                <div className="bg-secondary-50 dark:bg-secondary-900 shadow-2xl rounded-2xl p-8 space-y-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400">Welcome to UMJI POS</h1>
                        <p className="text-secondary-500 dark:text-secondary-400 mt-2">Let's set up your store</p>
                    </div>

                    <Stepper currentStep={step} />

                    <div className="min-h-[350px]">
                        {renderStep()}
                    </div>
                    
                    <div className="flex justify-between items-center pt-6 border-t border-secondary-200 dark:border-secondary-800">
                        <button type="button" onClick={handleBack} disabled={step === 1} className="px-6 py-3 bg-secondary-200 dark:bg-secondary-700 font-semibold rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600 transition disabled:opacity-50 disabled:cursor-not-allowed">Back</button>
                        {step < 3 ? (
                            <button type="button" onClick={handleNext} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg shadow-md transition flex items-center gap-2">Next <ArrowRight size={16}/></button>
                        ) : (
                            <button type="button" onClick={handleRegistration} disabled={isLoading} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition disabled:bg-green-300">
                                {isLoading ? 'Registering...' : 'Complete Setup'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const Stepper: React.FC<{ currentStep: number }> = ({ currentStep }) => {
    const steps = [
        { num: 1, title: 'Business Details', icon: Building },
        { num: 2, title: 'Admin Account', icon: UserIcon },
        { num: 3, title: 'Finalize Setup', icon: CheckCircle }
    ];
    return (
        <div className="flex justify-between items-center">
            {steps.map((step, index) => (
                <React.Fragment key={step.num}>
                    <div className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${currentStep >= step.num ? 'bg-primary-500 text-white' : 'bg-secondary-200 dark:bg-secondary-800 text-secondary-500'}`}>
                            {currentStep > step.num ? <CheckCircle size={20}/> : <step.icon size={20}/>}
                        </div>
                        <p className={`text-xs mt-1 font-medium ${currentStep >= step.num ? 'text-primary-600 dark:text-primary-400' : 'text-secondary-500'}`}>{step.title}</p>
                    </div>
                    {index < steps.length - 1 && <div className={`flex-1 h-1 mx-2 rounded-full ${currentStep > index + 1 ? 'bg-primary-500' : 'bg-secondary-200 dark:bg-secondary-800'}`}></div>}
                </React.Fragment>
            ))}
        </div>
    );
};

const FormField: React.FC<{ name: string, label: string, value: string, onChange: (e: any) => void, onBlur: (e: any) => void, error?: string, type?: string, required?: boolean, as?: 'input' | 'textarea', isPassword?: boolean, showPassword?: boolean, onToggleVisibility?: () => void, touched?: boolean }> = ({ name, label, value, onChange, onBlur, error, type, required, as = 'input', isPassword, showPassword, onToggleVisibility, touched }) => {
    const hasError = touched && !!error;
    const isValid = touched && !error && value;
    const className = `block w-full pl-3 pr-10 py-3 text-sm bg-transparent rounded-lg border-2 appearance-none focus:outline-none focus:ring-0 peer ${hasError ? 'border-red-500 focus:border-red-500' : 'border-secondary-300 dark:border-secondary-700 focus:border-primary-500'}`;
    const commonProps = { name, id: name, value, onChange, onBlur, required, className, placeholder: " " };

    return (
        <div className="relative">
            {as === 'textarea' ?
                <textarea {...commonProps} /> :
                <input {...commonProps} type={type} />
            }
            <label htmlFor={name} className={`absolute text-sm duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3 ${hasError ? 'text-red-600 dark:text-red-500' : 'text-secondary-500 dark:text-secondary-400 peer-focus:text-primary-600'}`}>{label}</label>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {isValid && <CheckCircle size={20} className="text-primary-500" />}
                {isPassword && onToggleVisibility && (
                  <button type="button" onClick={onToggleVisibility} className="text-secondary-500">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                )}
            </div>
            {hasError && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
    );
};

const Step1: React.FC<{ data: any, setData: any, errors: any, onLogoUpload: any, logoPreview: string | null, touched: any, setTouched: any }> = ({ data, setData, errors, onLogoUpload, logoPreview, touched, setTouched }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setData({ ...data, [e.target.name]: e.target.value });
      setTouched({ ...touched, [e.target.name]: true });
    };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => setTouched({ ...touched, [e.target.name]: true });
    return (
        <div className="space-y-4 animate-slideInUp">
            <div className="flex items-center gap-4">
                <label htmlFor="logo-upload" className="cursor-pointer">
                    {logoPreview ? (
                        <img src={logoPreview} alt="Logo Preview" className="w-20 h-20 rounded-full object-cover bg-secondary-200"/>
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center text-white text-3xl font-bold">
                            {data.storeName.charAt(0).toUpperCase() || '?'}
                        </div>
                    )}
                    <input id="logo-upload" type="file" accept=".jpg,.png" onChange={onLogoUpload} className="hidden"/>
                </label>
                <div className="flex-1">
                    <FormField name="storeName" label="Business Name" value={data.storeName} onChange={handleChange} onBlur={handleBlur} error={errors.storeName} required touched={touched.storeName} />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="ownerName" label="Owner Name" value={data.ownerName} onChange={handleChange} onBlur={handleBlur} error={errors.ownerName} required touched={touched.ownerName} />
                <FormField name="phone" label="Phone Number" value={data.phone} onChange={handleChange} onBlur={handleBlur} error={errors.phone} type="tel" required touched={touched.phone} />
            </div>
            <FormField name="email" label="Email Address (Optional)" value={data.email} onChange={handleChange} onBlur={handleBlur} error={errors.email} type="email" touched={touched.email} />
            <FormField name="address" label="Address (Optional)" value={data.address} onChange={handleChange} onBlur={handleBlur} error={errors.address} as="textarea" touched={touched.address} />
        </div>
    );
};

const Step2: React.FC<{ data: any, setData: any, errors: any, touched: any, setTouched: any }> = ({ data, setData, errors, touched, setTouched }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [customQuestionIndices, setCustomQuestionIndices] = useState<Set<number>>(new Set());

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setData({ ...data, [e.target.name]: e.target.value });
        setTouched({ ...touched, [e.target.name]: true });
    };
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => setTouched({ ...touched, [e.target.name]: true });

    const handleSecurityChange = (index: number, field: 'question' | 'answer', value: string) => {
        const newQuestions = [...data.securityQuestions];
        newQuestions[index][field] = value;
        setData({ ...data, securityQuestions: newQuestions });
        setTouched({ ...touched, [`securityQuestion${index}`]: true, [`securityAnswer${index}`]: true, securityQuestions: true, securityAnswers: true });
    };
    
    const handleSecurityQuestionSelect = (index: number, value: string) => {
        const newCustomIndices = new Set(customQuestionIndices);
        if (value === 'custom') {
            newCustomIndices.add(index);
            handleSecurityChange(index, 'question', '');
        } else {
            newCustomIndices.delete(index);
            handleSecurityChange(index, 'question', value);
        }
        setCustomQuestionIndices(newCustomIndices);
    };

    const availableQuestions = (index: number) => {
        const selectedQuestions = data.securityQuestions.map(q => q.question).filter((q, i) => i !== index && q && !SECURITY_QUESTIONS.includes(q) && !customQuestionIndices.has(i));
        return SECURITY_QUESTIONS.filter(q => !selectedQuestions.includes(q) && !data.securityQuestions.some((sq, sqIdx) => sq.question === q && sqIdx !== index));
    };

    return (
        <div className="space-y-4 animate-slideInUp">
            <FormField name="username" label="Admin Username" value={data.username} onChange={handleChange} onBlur={handleBlur} error={errors.username} required touched={touched.username}/>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField name="password" label="Password" value={data.password} onChange={handleChange} onBlur={handleBlur} error={errors.password} type={showPassword ? 'text' : 'password'} required isPassword showPassword={showPassword} onToggleVisibility={() => setShowPassword(!showPassword)} touched={touched.password} />
                <FormField name="confirmPassword" label="Confirm Password" value={data.confirmPassword} onChange={handleChange} onBlur={handleBlur} error={errors.confirmPassword} type={showConfirmPassword ? 'text' : 'password'} required isPassword showPassword={showConfirmPassword} onToggleVisibility={() => setShowConfirmPassword(!showConfirmPassword)} touched={touched.confirmPassword} />
            </div>
            <div>
                <h3 className="text-md font-semibold mb-2 text-secondary-800 dark:text-secondary-200">Security Questions</h3>
                <p className="text-xs text-secondary-500 mb-2">These will be used for password recovery. Choose three different questions.</p>
                {data.securityQuestions.map((_: any, index: number) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                         {customQuestionIndices.has(index) ? (
                            <input value={data.securityQuestions[index].question} onChange={e => handleSecurityChange(index, 'question', e.target.value)} placeholder={`Custom Question ${index + 1}`} required className="p-3 w-full bg-secondary-100 dark:bg-secondary-800 rounded-lg border border-secondary-300 dark:border-secondary-700 text-sm"/>
                         ) : (
                            <select value={data.securityQuestions[index].question} onChange={e => handleSecurityQuestionSelect(index, e.target.value)} className="p-3 w-full bg-secondary-100 dark:bg-secondary-800 rounded-lg border border-secondary-300 dark:border-secondary-700 text-sm">
                                <option value="" disabled>Select Question {index + 1}</option>
                                {availableQuestions(index).map(q => <option key={q} value={q}>{q}</option>)}
                                <option value="custom">+ Add Custom Question</option>
                            </select>
                         )}
                        <input value={data.securityQuestions[index].answer} onChange={e => handleSecurityChange(index, 'answer', e.target.value)} placeholder={`Answer ${index + 1}`} required className="p-3 w-full bg-secondary-100 dark:bg-secondary-800 rounded-lg border border-secondary-300 dark:border-secondary-700 text-sm" />
                    </div>
                ))}
                {touched.securityQuestions && errors.securityQuestions && <p className="text-xs text-red-600 mt-1">{errors.securityQuestions}</p>}
                {touched.securityAnswers && errors.securityAnswers && <p className="text-xs text-red-600 mt-1">{errors.securityAnswers}</p>}
            </div>
        </div>
    );
};

const Step3: React.FC<{ data: any, setData: any }> = ({ data, setData }) => {
    const handleOptionChange = (e: React.ChangeEvent<HTMLInputElement>) => setData({...data, [e.target.name]: e.target.checked });
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setData({...data, [e.target.name]: e.target.value });
    return (
        <div className="space-y-6 animate-slideInUp">
            <div>
                <h3 className="text-lg font-semibold mb-2 text-secondary-800 dark:text-secondary-200">Initial Data Setup</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button type="button" onClick={() => setData({...data, startWithDemo: true })} className={`p-6 rounded-lg border-2 text-left transition ${data.startWithDemo ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-secondary-300 dark:border-secondary-700'}`}>
                        <div className="flex items-center gap-2"><Database/> <h4 className="font-bold">Start with Demo Data</h4></div>
                        <p className="text-sm mt-1 text-secondary-500">Includes sample products, sales, and customers to help you explore.</p>
                    </button>
                    <button type="button" onClick={() => setData({...data, startWithDemo: false })} className={`p-6 rounded-lg border-2 text-left transition ${!data.startWithDemo ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-secondary-300 dark:border-secondary-700'}`}>
                        <div className="flex items-center gap-2"><Circle/> <h4 className="font-bold">Start Fresh</h4></div>
                        <p className="text-sm mt-1 text-secondary-500">Begin with a clean slate and add your own products from scratch.</p>
                    </button>
                </div>
            </div>
            <div>
                 <h3 className="text-lg font-semibold mb-2 text-secondary-800 dark:text-secondary-200">Store & Advanced Options</h3>
                 <div className="space-y-3 p-4 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                    <label className="flex items-center justify-between">
                        <span>Store Currency Symbol</span>
                        <input
                            type="text"
                            name="currency"
                            value={data.currency}
                            onChange={handleInputChange}
                            maxLength={5}
                            className="w-20 p-2 text-center bg-secondary-50 dark:bg-secondary-900 border border-secondary-300 dark:border-secondary-700 rounded-md"
                        />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span>Enable Dark Mode by default</span>
                        <input type="checkbox" name="enableDarkMode" checked={data.enableDarkMode} onChange={handleOptionChange} className="sr-only peer"/>
                        <div className="relative w-11 h-6 bg-secondary-200 peer-focus:outline-none rounded-full peer dark:bg-secondary-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span>Auto Backup to Cloud (future)</span>
                        <input type="checkbox" name="autoBackup" checked={data.autoBackup} onChange={handleOptionChange} className="sr-only peer"/>
                        <div className="relative w-11 h-6 bg-secondary-200 peer-focus:outline-none rounded-full peer dark:bg-secondary-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span>Enable Quick Sale Mode</span>
                        <input type="checkbox" name="enableQuickSale" checked={data.enableQuickSale} onChange={handleOptionChange} className="sr-only peer"/>
                        <div className="relative w-11 h-6 bg-secondary-200 peer-focus:outline-none rounded-full peer dark:bg-secondary-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                    </label>
                 </div>
            </div>
        </div>
    );
};


export default RegisterPage;