import './App.css';
import { Link, useNavigate} from "react-router-dom";
import {auth,db} from './firebase';
import { createUserWithEmailAndPassword } from "firebase/auth";
import {doc,setDoc} from "firebase/firestore";
import { useState } from 'react';
import { toast } from 'react-toastify';
import { speak } from './utils/speech';
import ThemeToggle from './components/ThemeToggle';

function Register(){
    const navigate=useNavigate();
    function showPassword() {
    const x = document.getElementById("password");

    if (x.type === "password") {
      x.type = "text";
    } else {
      x.type = "password";
    }
  }

  const register = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      const message = "Passwords do not match. Please try again.";
      toast.error(message);
      speak(message);
      return;
    }

    setIsSubmitting(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      try {
        await setDoc(doc(db, "Users", userCredential.user.uid), {
          name: name.trim(),
          email: email.trim()
        });
      } catch (error) {
        console.error("Account created, but saving the Firestore profile failed:", error?.code || error?.message || error);
        const message = error?.code === "permission-denied"
          ? "Your account was created, but Firestore rules blocked saving your profile. You can sign in; update the Firestore rules to save profile data."
          : `Your account was created, but the profile could not be saved (${error?.code || "Firestore error"}). You can sign in.`;
        toast.error(message, { autoClose: 8000 });
        speak(message);
        navigate("/login");
        return;
      }

      toast.success("Registration successful");
      navigate("/login");
    } catch (error) {
      showRegistrationError(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [isSubmitting,setIsSubmitting]=useState(false);

  const showRegistrationError = (error) => {
    console.error("Registration failed:", error?.code || error?.message || error);

    const messages = {
      "auth/weak-password": "Password must contain at least 6 characters.",
      "auth/email-already-in-use": "This email already has an account. Try logging in instead.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/operation-not-allowed": "Email and password sign-in is disabled. Enable it in Firebase Console under Authentication > Sign-in method.",
      "auth/invalid-api-key": "Firebase rejected the API key. Check the Firebase config in src/firebase.js.",
      "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication settings.",
      "auth/network-request-failed": "Could not reach Firebase. Check your internet connection and try again.",
      "auth/too-many-requests": "Too many attempts. Wait a little while, then try again.",
    };
    const message = messages[error?.code] || error?.message || "Registration failed. Check the browser console for the Firebase error code.";
    toast.error(message, { autoClose: 7000 });
    speak(message);
  };

  return (
    <main className="auth-page">
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-card">
        <header className="auth-heading">
          <h1>EDUCARE</h1>
          <h2>Create your account</h2>
          <p>Start your accessible learning journey.</p>
        </header>

        <form onSubmit={register}>

          <label>Full Name</label>
          <input type="text" placeholder="Enter your full name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />

          <label>Email Address</label>
          <input type="email" placeholder="Enter your email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />

          <label>Password</label>
          <input type="password" id="password" autoComplete="new-password" placeholder="Create password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />

          <label>Confirm Password</label>
          <input type="password" autoComplete="new-password" placeholder="Confirm password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

          <div className="checkbox">
            <input
              type="checkbox"
              onChange={showPassword}
            />
            <span>Show Password</span>
          </div>
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating account..." : "Create Account"}</button>

        </form>

        <p className="login">
          Already have an account?
          <Link to="/login"> Login</Link>
        </p>

      </section>
    </main>
    
    );
}
export default Register;
