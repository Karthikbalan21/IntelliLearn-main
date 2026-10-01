import {signInWithEmailAndPassword} from "firebase/auth";
import {Link, useNavigate} from "react-router-dom";
import { useState } from 'react';
import {auth} from './firebase';
import { toast } from 'react-toastify';
import {speak} from './utils/speech';
import ThemeToggle from './components/ThemeToggle';

function Login(){
    const [email,setEmail]=useState("");
    const [password,setPassword]=useState("");
    const navigate=useNavigate();

    const login=async(e)=>{

    if (e && typeof e.preventDefault === "function") {
        e.preventDefault();
    }


    try{

    await signInWithEmailAndPassword(auth,email,password);
    toast.success("Login Success");
    navigate("/home");
    }
    catch(error){

    toast.error(error.message);
    speak("Login failed.Please check your email and password and try again.");
    }
    }
    return (
        <main className="auth-page">
            <ThemeToggle className="auth-theme-toggle" />
            <section className="auth-card">
                <header className="auth-heading">
                    <h1>EDUCARE</h1>
                    <h2>Welcome back</h2>
                    <p>Sign in to continue your learning journey.</p>
                </header>
                <form onSubmit={login}>
                    <label>Email Address</label>
                    <input type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <label>Password</label>
                    <input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="submit">Login</button>
                </form>
                <p className="login">Don't have an account?<Link to="/"> Register Here</Link></p>
            </section>
        </main>
    );
}
export default Login;
