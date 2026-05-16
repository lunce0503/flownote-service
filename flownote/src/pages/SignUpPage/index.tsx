import SignUpWidget from "../../widgets/SignUpWidget";
const SignUpPage = () => {
    return (
        <div className="min-h-screen bg-amber-100 flex flex-col items-center justify-center p-4 font-sans">
            <SignUpWidget />
            <div className="mt-8 text-stone-400 text-xs font-mono">
                © 2026 Flownote Inc. All rights reserved.
            </div>
        </div>
    );
}

export default SignUpPage;
